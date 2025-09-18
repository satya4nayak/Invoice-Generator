const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');

const app = express();
const port = 3000;


app.use(bodyParser.json());
app.use(express.static(__dirname + "/public"));


mongoose.connect('mongodb://localhost:27017/invoiceDB', { useNewUrlParser: true, useUnifiedTopology: true });

const invoiceSchema = new mongoose.Schema({     
    customerName: String,
    items: [
        {
            description: String,
            quantity: Number,
            price: Number
        }
    ],
    totalAmount: Number
});

const Invoice = mongoose.model('Invoice', invoiceSchema);




app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);

});