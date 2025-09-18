const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const Razorpay = require("razorpay");
const QRCode = require("qrcode");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const twilio = require("twilio");

// Twilio setup
const accountSid = "AC122f8454ba8f1b48cc924acfd3e1e133";
const authToken = "cbb17ece22554a518c8980b7b49e1336";
const client = twilio(accountSid, authToken);
const app = express();
const port = 3000;

//Aswin chutiya
app.use(bodyParser.json());
app.use(express.static(__dirname + "/public"));

// Razorpay instance
const razorpay = new Razorpay({
  key_id: "rzp_live_1eTu3s4ZsUzeyD",
  key_secret: "7fwz6xvUtYDUxWUdfEMvVtwR",
});




mongoose.connect('mongodb://localhost:27017/invoiceDB', { useNewUrlParser: true, useUnifiedTopology: true });



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


async function generateInvoicePDF(invoiceData, filePath) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument();
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      doc.fontSize(20).text("Invoice", { align: "center" });
      doc.moveDown();
      doc.fontSize(12).text(`Customer: ${invoiceData.customerName}`);
      doc.text(`Invoice No: ${invoiceData.invoiceNumber}`);
      doc.text(`Date: ${new Date().toLocaleDateString()}`);
      doc.moveDown();

      let total = 0;
      doc.text("Item    Qty    Price    Total");
      invoiceData.items.forEach((item) => {
        const lineTotal = item.qty * item.price;
        total += lineTotal;
        doc.text(`${item.name}    ${item.qty}    ${item.price}    ${lineTotal}`);
      });

      doc.moveDown();
      doc.text(`Subtotal: ${total}`);
      const taxAmount = (total * invoiceData.tax) / 100;
      const grandTotal = total + taxAmount;
      doc.text(`Tax: ${invoiceData.tax}% = ${taxAmount}`);
      doc.text(`Grand Total: ${grandTotal}`, { underline: true });

      doc.end();
      stream.on("finish", () => resolve(filePath));
    } catch (err) {
      reject(err);
    }
  });
}



app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/home/index.html');
});





app.post("/api/generate-payment-qr", async (req, res) => {
  try {
    const { amount, currency } = req.body;

    // 1. Create Razorpay order
    const options = {
      amount: amount * 100, // amount in paise
      currency: currency || "INR",
    };

    const order = await razorpay.orders.create(options);

    // 2. Payment URL (customers can scan or click this)
    const paymentUrl = `https://checkout.razorpay.com/v1/checkout.js?order_id=${order.id}`;

    // 3. Generate QR Code from payment URL
    const qrCodeDataUrl = await QRCode.toDataURL(paymentUrl);

    // 4. Send back QR + order details
    res.json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      qrCode: qrCodeDataUrl, // base64 string (can be shown in <img src="...">)
    });
  } catch (err) {
    console.error("Error generating payment QR:", err);
    res.status(500).json({ success: false, message: "Failed to generate QR" });
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