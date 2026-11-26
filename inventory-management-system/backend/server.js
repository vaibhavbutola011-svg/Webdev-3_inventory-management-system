const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const connectDB = require('./config/db');
const productRoutes = require('./routes/productRoutes');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

const app = express();

app.use(express.json());

// API
app.use('/api/products', productRoutes);
app.use('/api', notFound);

// Serve the dashboard (frontend/) from the same origin, so no CORS is needed
app.use(express.static(path.join(__dirname, '..', 'frontend')));

app.use(errorHandler);

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Dashboard:  http://localhost:${PORT}/`);
    console.log(`API:        http://localhost:${PORT}/api/products`);
  });
});
