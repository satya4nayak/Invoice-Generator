const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const Razorpay = require("razorpay");
const QRCode = require("qrcode");
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
    
});
const Invoice = mongoose.model('Invoice', invoiceSchema);

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
    
});


app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);

});