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


app.post("/api/generate-payment-qr", async (req, res) => {
  try {
    const { amount, customerName, customerPhone, items, tax } = req.body;

    // Step 1: Create Razorpay Order (amount in paise)
    const order = await razorpay.orders.create({
      amount: amount, // already in paise (5000 = ₹50.00)
      currency: "INR",
      receipt: "receipt_" + Date.now(),
      payment_capture: 1
    });

    // Step 2: Generate Payment URL for this order
    const paymentUrl = `upi://pay?pa=YOUR_VPA_ID@okicici&pn=${encodeURIComponent(
      customerName
    )}&am=${amount / 100}&cu=INR&tn=Invoice%20Payment%20${order.id}`;

    // Step 3: Generate QR Code
    const qrCode = await QRCode.toDataURL(paymentUrl);

    // Step 4: Return QR and order details to frontend
    res.json({
      success: true,
      orderId: order.id,
      qrCode, // Base64 string
      paymentUrl
    });

    // Optional: Store customer + order in DB (so you can check payment later)
  } catch (err) {
    console.error("Error generating payment QR:", err);
    res.status(500).json({ success: false, message: "Failed to generate QR" });
  }
});



// Store pending orders in memory (for demo)
const pendingOrders = {};

app.post("/api/payment-webhook", express.json({ type: "*/*" }), async (req, res) => {
  try {
    const payload = req.body;
    const orderId = payload.payload.payment.entity.order_id;

    if (pendingOrders[orderId]) {
      const invoiceData = pendingOrders[orderId];

      // Call invoice generator automatically
      const { customerName, customerPhone, items, tax } = invoiceData;

      const invoiceNumber = "INV-" + Date.now();
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

      // Generate PDF
      if (!fs.existsSync("./invoices")) fs.mkdirSync("./invoices");
      const filePath = `./invoices/${invoiceNumber}.pdf`;
      await generateInvoicePDF(invoiceDoc, filePath);

      const mediaUrl = `/invoices/${invoiceNumber}.pdf`;

      await client.messages.create({
        from: "whatsapp:+14155238886", // Twilio sandbox
        to: `whatsapp:${customerPhone}`,
        body: `✅ Payment received!\nHere is your invoice #${invoiceNumber}`,
        mediaUrl: [mediaUrl],
      });

      delete pendingOrders[orderId]; // cleanup

      console.log("Invoice sent after payment success.");
    }

    res.json({ status: "ok" });
  } catch (err) {
    console.error("Webhook Error:", err);
    res.status(500).json({ status: "failed" });
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