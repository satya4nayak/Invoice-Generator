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
const productSchema = new mongoose.Schema({
    name: String,
    price: Number
});
const Product = mongoose.model('Product', productSchema);

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
    
});


app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);

});