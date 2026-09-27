require('dotenv').config();
const express = require('express');
const cors = require('cors');

const searchRoutes = require('./routes/search');
const productRoutes = require('./routes/products');
const scrapeRoutes = require('./routes/scrape');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api', searchRoutes);
app.use('/api', productRoutes);
app.use('/api', scrapeRoutes);

app.get('/health', (req, res) => res.json({ ok: true }));

process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION (server stays up):', err);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));