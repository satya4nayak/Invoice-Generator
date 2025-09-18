const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const Razorpay = require("razorpay");
const QRCode = require("qrcode");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const twilio = require("twilio");
const dotenv=require("dotenv")
dotenv.config();
// Twilio setup
const accountSid = process.env.ACCOUNT_SID;
const authToken = process.env.AUTH_ID;
const client = twilio(accountSid, authToken);
const app = express();
const port = 3000;

//Aswin chutiya
app.use(bodyParser.json());
app.use(express.static(__dirname + "/public"));

// Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RZP_KEY_ID,
  key_secret:process.env.RZP_KEY_SECRET
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
      price: Number
    }
  ],
  tax: Number,
  total: Number,
  invoiceNumber: String,
  date: { type: Date, default: Date.now }
});
const Invoice = mongoose.model('Invoice', invoiceSchema);







const productSchema = new mongoose.Schema({
    name: String,
    price: Number
});
const Product = mongoose.model('Product', productSchema);






app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/home/index.html');
});


app.get('/api/get-products', async (req, res) => {
  try {
    const products = await Product.find({});
    res.json({ success: true, products });
  } catch (err) {
    console.error("Error fetching products:", err);
    res.status(500).json({ success: false, message: "Failed to retrieve products" });
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


// Step 2: Verify Payment Signature
app.post("/api/payment/verify", async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, invoiceId } = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RZP_KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    if (expectedSignature === razorpay_signature) {
      // Mark invoice as Paid
      await Invoice.findByIdAndUpdate(invoiceId, {
        paymentStatus: "Paid",
        paymentId: razorpay_payment_id,
        razorpayOrderId: razorpay_order_id,
      });

      // Call invoice sending API
      const invoice = await Invoice.findById(invoiceId);
      if (invoice) {
        // 🔥 Call your send-invoice logic here directly instead of waiting for frontend
        if (!fs.existsSync("./invoices")) fs.mkdirSync("./invoices");
        const filePath = `./invoices/${invoice.invoiceNumber}.pdf`;
        await generateInvoicePDF(invoice, filePath);

        const mediaUrl = `/invoices/${invoice.invoiceNumber}.pdf`;
        await client.messages.create({
          from: "whatsapp:+14155238886",
          to: `whatsapp:${invoice.customerPhone}`,
          body: `Hello ${invoice.customerName}, your payment is successful. Here is your invoice #${invoice.invoiceNumber}.`,
          mediaUrl: [mediaUrl],
        });
      }

      return res.json({ success: true, message: "Payment verified & invoice sent!" });
    } else {
      return res.status(400).json({ success: false, message: "Invalid signature" });
    }
  } catch (err) {
    console.error("Error verifying payment:", err);
    res.status(500).json({ success: false, message: "Payment verification failed" });
  }
});




app.post('/api/send-invoice', async (req, res) => {
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
      invoiceNumber
    });
    await invoiceDoc.save();

    // Generate invoice PDF
    if (!fs.existsSync("./invoices")) fs.mkdirSync("./invoices");
    const filePath = `./invoices/${invoiceNumber}.pdf`;
    await generateInvoicePDF(invoiceDoc, filePath);

    // NOTE: Twilio requires public URL, so upload this PDF to Cloudinary / S3.
    // For now, assume you serve /invoices/ as static
    const mediaUrl = `/invoices/${invoiceNumber}.pdf`;

    await client.messages.create({
      from: "whatsapp:+14155238886", // Twilio sandbox number
      to: `whatsapp:${customerPhone}`,
      body: `Hello ${customerName}, here is your invoice #${invoiceNumber}.`,
      mediaUrl: [mediaUrl],
    });

    res.json({ success: true, message: "Invoice sent successfully!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to send invoice" });
  }
});


app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);

});