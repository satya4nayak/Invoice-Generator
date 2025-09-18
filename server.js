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




mongoose.connect('mongodb://localhost:27017/invoiceDB', { useNewUrlParser: true, useUnifiedTopology: true });
const invoiceSchema = new mongoose.Schema({     
    
});
const Invoice = mongoose.model('Invoice', invoiceSchema);

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/home/index.html');
});


app.get('/api/get-products',(req,res)=>{   
    Product.find({},(err,products)=>{
        if(err){
            return res.status(500).json({success:false,message:"Failed to retrieve products"});
        }
        res.json({success:true,products});
    });
});

app.post("/api/generate-payment-qr", async (req, res) => {
  
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