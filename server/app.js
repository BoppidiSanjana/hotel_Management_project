require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { requireAuth } = require('./middleware/auth');

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is not set');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

app.get('/healthz', (req, res) => res.send('ok'));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/rooms', requireAuth, require('./routes/rooms'));
app.use('/api/guests', requireAuth, require('./routes/guests'));
app.use('/api/bookings', requireAuth, require('./routes/bookings'));
app.use('/api/dashboard', requireAuth, require('./routes/dashboard'));

app.use(express.static(path.join(__dirname, '../public')));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

// Open pooled connections up front so the first dashboard load isn't paying TLS handshakes
const pool = require('./db/pool');
Promise.all(Array.from({ length: 6 }, () => pool.query('SELECT 1'))).catch((e) => console.error('DB warm-up failed:', e.message));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Hotel system running on http://localhost:${port}`));
