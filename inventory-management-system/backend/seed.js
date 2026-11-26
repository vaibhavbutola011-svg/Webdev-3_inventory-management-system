// Optional: populate the database with sample data.  Usage: npm run seed
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const mongoose = require('mongoose');
const connectDB = require('./config/db');
const Product = require('./models/Product');

const products = [
  { name: 'Study Table', sku: 'FURN-TB-812', category: 'Furniture', price: 3999, quantity: 2, reorderLevel: 4, supplier: 'IKEA India' },
  { name: 'Office Chair', sku: 'FURN-CH-204', category: 'Furniture', price: 5499, quantity: 15, reorderLevel: 5, supplier: 'Godrej Interio' },
  { name: 'Bookshelf', sku: 'FURN-BS-310', category: 'Furniture', price: 2799, quantity: 3, reorderLevel: 5, supplier: 'IKEA India' },
  { name: 'Wireless Mouse', sku: 'ELEC-MS-101', category: 'Electronics', price: 799, quantity: 45, reorderLevel: 15, supplier: 'Logitech' },
  { name: 'Mechanical Keyboard', sku: 'ELEC-KB-102', category: 'Electronics', price: 3499, quantity: 20, reorderLevel: 8, supplier: 'Keychron' },
  { name: '27" Monitor', sku: 'ELEC-MN-330', category: 'Electronics', price: 15999, quantity: 9, reorderLevel: 10, supplier: 'Dell India' },
  { name: 'Laptop Stand', sku: 'ELEC-LS-415', category: 'Electronics', price: 1299, quantity: 22, reorderLevel: 10, supplier: 'Portronics' },
  { name: 'Cotton T-Shirt', sku: 'APRL-TS-501', category: 'Apparel', price: 599, quantity: 60, reorderLevel: 20, supplier: 'Allen Solly' },
  { name: 'Denim Jacket', sku: 'APRL-JK-512', category: 'Apparel', price: 2199, quantity: 18, reorderLevel: 6, supplier: 'Levi\'s India' },
  { name: 'Gel Pen Pack of 15', sku: 'STNY-PN-713', category: 'Stationery', price: 120, quantity: 40, reorderLevel: 20, supplier: 'Cello Pens' },
  { name: 'A4 Notebook (Pack of 5)', sku: 'STNY-NB-720', category: 'Stationery', price: 350, quantity: 8, reorderLevel: 12, supplier: 'Classmate' },
  { name: 'Stapler', sku: 'STNY-ST-731', category: 'Stationery', price: 180, quantity: 5, reorderLevel: 5, supplier: 'Kangaro' },
  { name: 'Basmati Rice 5kg', sku: 'GROC-RC-901', category: 'Grocery', price: 649, quantity: 35, reorderLevel: 15, supplier: 'India Gate' },
  { name: 'Olive Oil 1L', sku: 'GROC-OL-912', category: 'Grocery', price: 899, quantity: 12, reorderLevel: 10, supplier: 'Figaro' },
];

(async () => {
  await connectDB();
  await Product.deleteMany({});
  await Product.create(products);
  console.log(`Seeded ${products.length} products.`);
  await mongoose.disconnect();
})();
