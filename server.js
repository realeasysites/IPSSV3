const express = require('express');
const path = require('path');

require('./db/init');
const adminRoutes = require('./routes/admin');
const publicRoutes = require('./routes/public');
const { router: analyticsRoutes } = require('./routes/analytics');

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

app.get('/healthz', (req, res) => res.type('text').send('ok'));

// Order matters: admin + API routes first, so /admin always asks for the password
// before any public file can be served.
app.use(analyticsRoutes);
app.use(adminRoutes);
app.use(express.json({ limit: '32kb' }));
app.use(publicRoutes);

// Home page: fill in the live domain for canonical/OG tags
const fs = require('fs');
const SITE_URL = (process.env.SITE_URL || 'https://imageproscreenprint.com').replace(/\/+$/, '');
const homeHtml = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8').replace(/%%SITE_URL%%/g, SITE_URL);
app.get(['/', '/index.html'], (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.type('html').send(homeHtml);
});

app.use(
  express.static(path.join(__dirname, 'public'), {
    extensions: ['html'],
    maxAge: '7d',
    setHeaders(res, file) {
      if (/\.(html|css|js)$/.test(file)) res.setHeader('Cache-Control', 'public, max-age=300');
    },
  })
);

app.use((req, res) => res.status(404).sendFile(path.join(__dirname, 'public', '404.html')));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Imagepro site listening on ${port}`));
