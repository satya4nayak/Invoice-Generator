const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const Razorpay = require("razorpay");
const QRCode = require("qrcode");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const twilio = require("twilio");
const dotenv = require("dotenv");
const axios = require("axios");
dotenv.config();
// Twilio setup
const accountSid = process.env.ACCOUNT_SID;
const authToken = process.env.AUTH_ID;
const client = twilio(accountSid, authToken);
const app = express();
const port = 3000;
const cors = require("cors");

// Allow all origins (for development)
app.use(cors());

// OR restrict to your frontend
// app.use(cors({ origin: "http://127.0.0.1:5500" }));

//Aswin chutiya
app.use(bodyParser.json());
app.use(express.static(__dirname + "/public"));

// Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RZP_KEY_ID,
  key_secret: process.env.RZP_KEY_SECRET,
});

mongoose
  .connect("mongodb://localhost:27017/invoiceDB", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));
const invoiceSchema = new mongoose.Schema({
  customerName: String,
  customerPhone: String,
  items: [
    {
      name: String,
      qty: Number,
      price: Number,
    },
  ],
  tax: Number,
  total: Number,
  invoiceNumber: String,
  date: { type: Date, default: Date.now },
});
const Invoice = mongoose.model("Invoice", invoiceSchema);

const productSchema = new mongoose.Schema({
  name: String,
  price: Number,
});
const Product = mongoose.model("Product", productSchema);

app.use("/invoices", express.static(__dirname + "/invoices"));

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/home/index.html");
});

app.get("/api/get-products", async (req, res) => {
  try {
    const products = await Product.find({});
    res.json({ success: true, products });
  } catch (err) {
    console.error("Error fetching products:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to retrieve products" });
  }
});

const crypto = require("crypto");

// Step 1: Generate Razorpay Order
app.post("/api/create-order", async (req, res) => {
  try {
    const { customerName, customerPhone, items, tax } = req.body;
    
    // Calculate totals
    const subtotal = items.reduce((sum, i) => sum + i.qty * i.price, 0);
    const total = subtotal + (subtotal * tax) / 100;
    const invoiceNumber = "INV-" + Date.now();

    // Save invoice draft in DB
    const invoiceDoc = new Invoice({
      customerName,
      customerPhone,
      items,
      tax,
      total,
      invoiceNumber,
    });
    await invoiceDoc.save();

    // Create Razorpay order
    const orderOptions = {
      amount: total * 100, // in paise
      currency: "INR",
      receipt: invoiceNumber,
      payment_capture: 1,
    };
    const order = await razorpay.orders.create(orderOptions);

    res.json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      key: process.env.RZP_KEY_ID,
      invoiceId: invoiceDoc._id,
    });
  } catch (err) {
    console.error("Error creating order:", err);
    res.status(500).json({ success: false, message: "Failed to create order" });
  }
});

app.post("/api/send-invoice", async (req, res) => {
  try {
    const { customerName, customerPhone, items, tax } = req.body;

    // Auto-generate invoice number
    const invoiceNumber = "INV-" + Date.now();

    // Save invoice in DB
    const subtotal = items.reduce((sum, i) => sum + i.qty * i.price, 0);
    const total = subtotal + (subtotal * tax) / 100;
    const invoiceDoc = new Invoice({
      customerName,
      customerPhone,
      items,
      tax,
      total,
      invoiceNumber,
    });
    await invoiceDoc.save();

    // Generate invoice PDF
    if (!fs.existsSync("./invoices")) fs.mkdirSync("./invoices");
    const filePath = `./invoices/${invoiceNumber}.pdf`;
    await generateInvoicePDF(invoiceDoc, filePath);

    // NOTE: Twilio requires public URL, so upload this PDF to Cloudinary / S3.
    // For now, assume you serve /invoices/ as static
    // const mediaUrl = `https://wb132r23-3000.inc1.devtunnels.ms/invoices/INV-1758180738588.pdf`;

    await client.messages.create({
      from: "whatsapp:+14155238886", // Twilio sandbox number
      to: `whatsapp:+919902227821`,
      body: `Hello ${customerName}, here is your invoice #${invoiceNumber}. CLICK HERE https://wb132r23-3000.inc1.devtunnels.ms/invoices/${invoiceNumber}.pdf`,
    });

    res.json({ success: true, message: "Invoice sent successfully!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to send invoice" });
  }
});

// Step 2: Verify Payment Signature
app.post("/api/payment/verify", async (req, res) => {
    const { razorpay, invoiceId } =req.body;
    const customer = await Invoice.findOne({ _id: new mongoose.Types.ObjectId(invoiceId) });
    console.log(customer);
  try {
    await axios.post(`http://localhost:3000/api/send-invoice`, {
      customerName: customer.customerName || "Aswin",
      customerPhone: customer.customerPhone || "9902227821",
      items: [
        {
          name: "Rice",
          qty: 1,
          price: 50,
        },
        {
          name: "Toor Dal",
          qty: 1,
          price: 110,
        },
        {
          name: "Sugar",
          qty: 1,
          price: 45,
        },
      ],
      tax: 0,
    });

    return res.json({
      success: true,
      message: "Payment verified & invoice sent!",
    });
  } catch (err) {
    console.error("Error verifying payment:", err);
    res
      .status(500)
      .json({ success: false, message: "Payment verification failed" });
  }
});

async function generateInvoicePDF(invoice, filePath) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const writeStream = fs.createWriteStream(filePath);
      doc.pipe(writeStream);

      // ---------- Header ----------
      doc.fontSize(20).text("INVOICE", { align: "center", underline: true });
      doc.moveDown();

      doc
        .fontSize(12)
        .text(`Invoice Number: ${invoice.invoiceNumber}`)
        .text(`Date: ${new Date(invoice.date).toLocaleDateString()}`)
        .text(`Customer Name: ${invoice.customerName}`)
        .text(`Customer Phone: ${invoice.customerPhone}`);
      doc.moveDown();

      // ---------- Table ----------
      const tableTop = doc.y + 20;
      const itemCodeX = 50;
      const itemNameX = 100;
      const qtyX = 300;
      const priceX = 350;
      const totalX = 450;

      // Table Header
      doc.fontSize(12).fillColor("black").text("No.", itemCodeX, tableTop);
      doc.text("Item", itemNameX, tableTop);
      doc.text("Qty", qtyX, tableTop);
      doc.text("Price", priceX, tableTop);
      doc.text("Total", totalX, tableTop);

      // Draw header line
      doc
        .moveTo(50, tableTop + 15)
        .lineTo(550, tableTop + 15)
        .stroke();

      // Table rows
      let y = tableTop + 25;
      invoice.items.forEach((item, idx) => {
        // Alternate row color
        if (idx % 2 === 0) {
          doc.rect(50, y - 2, 500, 20).fill("#f0f0f0");
          doc.fillColor("black");
        }

        doc.fillColor("black").text(idx + 1, itemCodeX, y);
        doc.text(item.name, itemNameX, y);
        doc.text(item.qty, qtyX, y);
        doc.text(`₹${item.price.toFixed(2)}`, priceX, y);
        doc.text(`₹${(item.qty * item.price).toFixed(2)}`, totalX, y);
        y += 25;
      });

      // ---------- Totals ----------
      doc.moveTo(50, y).lineTo(550, y).stroke();
      y += 10;
      doc
        .fontSize(12)
        .text(`Tax: ${invoice.tax}%`, totalX - 100, y, { align: "right" });
      y += 20;
      doc
        .fontSize(14)
        .text(`Total: ₹${invoice.total.toFixed(2)}`, totalX - 100, y, {
          align: "right",
        });

      // ---------- Footer ----------
      doc.moveDown(4);
      doc
        .fontSize(10)
        .text("Thank you for your business!", { align: "center" });

      doc.end();

      writeStream.on("finish", () => resolve());
      writeStream.on("error", (err) => reject(err));
    } catch (err) {
      reject(err);
    }
  });
}

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
