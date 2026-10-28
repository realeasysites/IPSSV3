const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'imagepro.sqlite');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT, item TEXT, quantity TEXT, method TEXT,
    deadline TEXT, contact_pref TEXT, details TEXT, source TEXT,
    status TEXT NOT NULL DEFAULT 'new', notes TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at);

  CREATE TABLE IF NOT EXISTS sa_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL DEFAULT (datetime('now')),
    visitor TEXT NOT NULL, type TEXT NOT NULL, path TEXT, source TEXT, device TEXT, label TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_sa_ts ON sa_events(ts);

  -- Store settings (pricing rules the owner edits in the dashboard)
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

  -- Package deals: fixed quantity, fixed price (like "100 tees for $399")
  CREATE TABLE IF NOT EXISTS packages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    style TEXT NOT NULL DEFAULT 'tee',      -- tee | longsleeve | hoodie | crewneck | youth | premium | hat | beanie (placeholder art + filter)
    group_name TEXT NOT NULL DEFAULT 'T-Shirts',
    garment TEXT,                           -- the blank, e.g. "Gildan Softstyle 64000"
    blurb TEXT,
    includes TEXT,                          -- e.g. "1 ink color, 1 print location (front or back)"
    sell_mode TEXT NOT NULL DEFAULT 'pack', -- pack = sizes must add up to pack_qty; each = any quantity, price each
    pack_qty INTEGER NOT NULL DEFAULT 50,
    price_cents INTEGER NOT NULL,
    colors TEXT, sizes TEXT, plus_sizes TEXT, plus_cents INTEGER NOT NULL DEFAULT 0,
    locations TEXT NOT NULL DEFAULT 'Front,Back',
    badge TEXT,
    needs_logo INTEGER NOT NULL DEFAULT 1,
    photo TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    ends_at TEXT,
    sort INTEGER NOT NULL DEFAULT 0,
    is_sample INTEGER NOT NULL DEFAULT 0
  );

  -- Custom order catalog (build-your-own): every blank the shop prints on
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    category TEXT NOT NULL,                 -- tees | longsleeve | hoodies | crewnecks | youth | hats | signs
    style TEXT NOT NULL DEFAULT 'tee',
    garment TEXT,
    blurb TEXT,
    kind TEXT NOT NULL DEFAULT 'apparel',   -- apparel (screen print) | hat (embroidery / patch) | sign (yard signs)
    colors TEXT, sizes TEXT, plus_sizes TEXT, plus_cents INTEGER NOT NULL DEFAULT 0,
    min_qty INTEGER NOT NULL DEFAULT 24,
    breaks TEXT NOT NULL,                   -- JSON [[min qty, cents per piece], ...]
    photo TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    sort INTEGER NOT NULL DEFAULT 0,
    is_sample INTEGER NOT NULL DEFAULT 0
  );

  -- Shopping cart (server side so each item can carry its own logo file)
  CREATE TABLE IF NOT EXISTS cart_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    cart TEXT NOT NULL,
    kind TEXT NOT NULL,                     -- package | custom
    ref_id INTEGER NOT NULL,
    config TEXT NOT NULL,                   -- JSON
    notes TEXT,
    artwork_file TEXT, artwork_name TEXT, no_logo INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_cart ON cart_items(cart);

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    token TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'awaiting_payment',
    needs_mockup INTEGER NOT NULL DEFAULT 1,
    payment_mode TEXT NOT NULL,
    stripe_session TEXT, paid_at TEXT,
    name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT NOT NULL,
    fulfillment TEXT NOT NULL DEFAULT 'pickup', address TEXT, need_by TEXT, notes TEXT,
    items_json TEXT NOT NULL,               -- JSON array of priced items (each with its own logo file)
    mockups TEXT NOT NULL DEFAULT '[]',     -- JSON array of proof files
    mockup_sent_at TEXT, approved_at TEXT, change_note TEXT,
    subtotal_cents INTEGER NOT NULL, tax_cents INTEGER NOT NULL DEFAULT 0, total_cents INTEGER NOT NULL,
    admin_notes TEXT, source TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);

  -- Team & crew stores: one link per team/company, everyone orders and pays for their own gear,
  -- the shop prints it all together after the store closes. (Replaces Big Cartel-style customer stores.)
  CREATE TABLE IF NOT EXISTS team_stores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,                     -- "Hawks Youth Soccer Fall Gear"
    org TEXT,                               -- "Hawks Youth Soccer"
    blurb TEXT,
    logo TEXT,                              -- /media/products/<file>
    accent TEXT NOT NULL DEFAULT '#111111',
    status TEXT NOT NULL DEFAULT 'open',    -- draft | open | closed
    closes_at TEXT,                         -- YYYY-MM-DD, open through the end of that day
    password TEXT,                          -- optional access code for private crew stores
    listed INTEGER NOT NULL DEFAULT 1,      -- show on the public Team Stores page
    name_cents INTEGER NOT NULL DEFAULT 0,  -- personalization: name on the back
    number_cents INTEGER NOT NULL DEFAULT 0,-- personalization: number
    fund_cents INTEGER NOT NULL DEFAULT 0,  -- fundraiser: amount per item that goes back to the team
    fund_goal_cents INTEGER NOT NULL DEFAULT 0,
    handoff TEXT,                           -- how people get their gear
    contact_name TEXT, contact_email TEXT,  -- organizer (gets the summary when the store closes)
    closed_notified INTEGER NOT NULL DEFAULT 0,
    is_sample INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS team_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id INTEGER NOT NULL,
    product_id INTEGER,                     -- catalog item it started from (reference only)
    name TEXT NOT NULL,
    style TEXT NOT NULL DEFAULT 'tee',
    garment TEXT,
    design TEXT,                            -- mockup image of the team's design on the garment
    design_note TEXT,                       -- e.g. "Front: Hawks logo, 2 colors"
    colors TEXT, sizes TEXT, plus_sizes TEXT, plus_cents INTEGER NOT NULL DEFAULT 0,
    price_cents INTEGER NOT NULL,
    personalize INTEGER NOT NULL DEFAULT 0, -- allow name / number
    active INTEGER NOT NULL DEFAULT 1,
    sort INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_team_items ON team_items(store_id);
`);

// columns added after the first version of the products table.
// brand + style_number use the same fields as SanMar's product data (e.g. Port & Company / PC54), so a live SanMar
// connection can later fill colors, sizes and images by style number without changing the pages. See lib/catalog.js.
const prodCols = db.prepare('PRAGMA table_info(products)').all().map((c) => c.name);
if (!prodCols.includes('brand')) db.exec('ALTER TABLE products ADD COLUMN brand TEXT');
if (!prodCols.includes('style_number')) db.exec('ALTER TABLE products ADD COLUMN style_number TEXT');
if (!prodCols.includes('source')) db.exec("ALTER TABLE products ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'");
if (!prodCols.includes('size_prices')) db.exec('ALTER TABLE products ADD COLUMN size_prices TEXT'); // signs: JSON {size: extra cents each}

// columns added after the first version of the orders table
const orderCols = db.prepare('PRAGMA table_info(orders)').all().map((c) => c.name);
if (!orderCols.includes('team_store_id')) db.exec('ALTER TABLE orders ADD COLUMN team_store_id INTEGER');
if (!orderCols.includes('recipient')) db.exec('ALTER TABLE orders ADD COLUMN recipient TEXT');
db.exec('CREATE INDEX IF NOT EXISTS idx_orders_team ON orders(team_store_id)');

/* ---------- starter content (clearly labeled samples, no photos yet) ---------- */
const SEED = process.env.SEED_SAMPLES !== 'false';

if (SEED && db.prepare('SELECT COUNT(*) n FROM packages').get().n === 0) {
  const ins = db.prepare(`INSERT INTO packages (slug,title,style,group_name,garment,blurb,includes,sell_mode,pack_qty,price_cents,colors,sizes,plus_sizes,plus_cents,locations,badge,needs_logo,sort,is_sample)
    VALUES (@slug,@title,@style,@group_name,@garment,@blurb,@includes,'pack',@pack_qty,@price_cents,@colors,@sizes,@plus_sizes,@plus_cents,'Front,Back',@badge,1,@sort,1)`);
  const INC = '1 ink color, 1 print location (front or back), free proof before we print';
  [
    { slug: 't-shirt-package-100', title: 'T-Shirt Package', style: 'tee', group_name: 'T-Shirts', garment: 'Classic soft cotton tee', blurb: 'Our go-to crew tee. Great for staff shirts, events and giveaways.', pack_qty: 100, price_cents: 39900, colors: 'White,Black,Charcoal,Sport Grey,Navy,Royal,Red,Forest Green', sizes: 'S,M,L,XL,2XL,3XL', plus_sizes: '2XL,3XL', plus_cents: 200, badge: 'Best value', sort: 50 },
    { slug: 'long-sleeve-package-50', title: 'Long Sleeve Package', style: 'longsleeve', group_name: 'Long Sleeve', garment: 'Heavy cotton long sleeve tee', blurb: 'Long sleeves for cool mornings on the job and fall events.', pack_qty: 50, price_cents: 44900, colors: 'White,Black,Charcoal,Sport Grey,Navy,Red', sizes: 'S,M,L,XL,2XL,3XL', plus_sizes: '2XL,3XL', plus_cents: 200, badge: '', sort: 40 },
    { slug: 'sweatshirt-package-50', title: 'Hoodie Package', style: 'hoodie', group_name: 'Sweatshirts', garment: 'Heavy blend pullover hoodie', blurb: 'The crew favorite once the weather turns. Warm, durable, and your logo front and center.', pack_qty: 50, price_cents: 74900, colors: 'Black,Charcoal,Sport Grey,Navy,Maroon,Forest Green', sizes: 'S,M,L,XL,2XL,3XL', plus_sizes: '2XL,3XL', plus_cents: 300, badge: 'Crew favorite', sort: 30 },
    { slug: 'youth-package-50', title: 'Youth T-Shirt Package', style: 'youth', group_name: 'Youth', garment: 'Youth heavy cotton tee', blurb: 'Kid sizes for teams, schools, camps and fundraisers.', pack_qty: 50, price_cents: 29900, colors: 'White,Black,Sport Grey,Navy,Royal,Red', sizes: 'YXS,YS,YM,YL,YXL', plus_sizes: '', plus_cents: 0, badge: 'Kid sizes', sort: 20 },
    { slug: 'premium-tee-package-50', title: 'Premium Tee Package', style: 'premium', group_name: 'Premium', garment: 'Heavyweight garment-dyed tee', blurb: 'A thicker, softer, retail-quality tee for merch people actually want to wear.', pack_qty: 50, price_cents: 54900, colors: 'White,Black,Pepper,Granite,Blue Jean,Moss', sizes: 'S,M,L,XL,2XL,3XL', plus_sizes: '2XL,3XL', plus_cents: 250, badge: 'Premium', sort: 10 },
  ].forEach((p) => ins.run({ ...p, includes: INC }));
}

if (SEED && db.prepare('SELECT COUNT(*) n FROM products').get().n === 0) {
  const ins = db.prepare(`INSERT INTO products (slug,name,category,style,garment,blurb,kind,colors,sizes,plus_sizes,plus_cents,min_qty,breaks,sort,is_sample,brand,style_number,size_prices,photo)
    VALUES (@slug,@name,@category,@style,@garment,@blurb,@kind,@colors,@sizes,@plus_sizes,@plus_cents,@min_qty,@breaks,@sort,1,@brand,@style_number,@size_prices,@photo)`);
  const ADULT = 'S,M,L,XL,2XL,3XL';
  const YOUTH = 'YXS,YS,YM,YL,YXL';
  const B = (a) => JSON.stringify(a);
  [
    { brand: 'Port & Company', style_number: 'PC54', slug: 'classic-tee', name: 'Classic Tee', category: 'tees', style: 'tee', garment: 'Soft cotton short sleeve tee', blurb: 'The everyday crew shirt.', kind: 'apparel', colors: 'White,Black,Charcoal,Sport Grey,Navy,Royal,Red,Forest Green,Safety Green,Safety Orange', sizes: ADULT, plus_sizes: '2XL,3XL', plus_cents: 200, min_qty: 24, breaks: B([[24, 1000], [48, 850], [72, 750], [144, 650], [288, 575]]), sort: 100 },
    { brand: 'District', style_number: 'DT6000', slug: 'premium-tee', name: 'Premium Tee', category: 'tees', style: 'premium', garment: 'Heavyweight garment-dyed tee', blurb: 'Thicker, softer, retail feel.', kind: 'apparel', colors: 'White,Black,Pepper,Granite,Blue Jean,Moss', sizes: ADULT, plus_sizes: '2XL,3XL', plus_cents: 250, min_qty: 24, breaks: B([[24, 1500], [48, 1325], [72, 1200], [144, 1100], [288, 1000]]), sort: 95 },
    { brand: 'Port & Company', style_number: 'PC54LS', slug: 'long-sleeve-tee', name: 'Long Sleeve Tee', category: 'longsleeve', style: 'longsleeve', garment: 'Heavy cotton long sleeve', blurb: 'Cool mornings, long days.', kind: 'apparel', colors: 'White,Black,Charcoal,Sport Grey,Navy,Red,Safety Green', sizes: ADULT, plus_sizes: '2XL,3XL', plus_cents: 200, min_qty: 24, breaks: B([[24, 1350], [48, 1175], [72, 1075], [144, 975], [288, 900]]), sort: 90 },
    { brand: 'Port & Company', style_number: 'PC78H', slug: 'pullover-hoodie', name: 'Pullover Hoodie', category: 'hoodies', style: 'hoodie', garment: 'Heavy blend pullover hoodie', blurb: 'Warm, tough, crew favorite.', kind: 'apparel', colors: 'Black,Charcoal,Sport Grey,Navy,Maroon,Forest Green,Safety Green', sizes: ADULT, plus_sizes: '2XL,3XL', plus_cents: 300, min_qty: 24, breaks: B([[24, 2400], [48, 2150], [72, 1975], [144, 1850], [288, 1700]]), sort: 85 },
    { brand: 'Port & Company', style_number: 'PC78ZH', slug: 'full-zip-hoodie', name: 'Full-Zip Hoodie', category: 'hoodies', style: 'hoodie', garment: 'Heavy blend full-zip hoodie', blurb: 'Zip-up comfort, left chest or back print.', kind: 'apparel', colors: 'Black,Charcoal,Sport Grey,Navy', sizes: ADULT, plus_sizes: '2XL,3XL', plus_cents: 300, min_qty: 24, breaks: B([[24, 3100], [48, 2850], [72, 2650], [144, 2500], [288, 2350]]), sort: 80 },
    { brand: 'Port & Company', style_number: 'PC78', slug: 'crewneck-sweatshirt', name: 'Crewneck Sweatshirt', category: 'crewnecks', style: 'crewneck', garment: 'Heavy blend crewneck', blurb: 'Clean, classic, no hood.', kind: 'apparel', colors: 'Black,Charcoal,Sport Grey,Navy,Maroon,Forest Green', sizes: ADULT, plus_sizes: '2XL,3XL', plus_cents: 300, min_qty: 24, breaks: B([[24, 2000], [48, 1800], [72, 1650], [144, 1550], [288, 1450]]), sort: 75 },
    { brand: 'Port & Company', style_number: 'PC54Y', slug: 'youth-tee', name: 'Youth Tee', category: 'youth', style: 'youth', garment: 'Youth heavy cotton tee', blurb: 'Kid sizes for teams and schools.', kind: 'apparel', colors: 'White,Black,Sport Grey,Navy,Royal,Red', sizes: YOUTH, plus_sizes: '', plus_cents: 0, min_qty: 24, breaks: B([[24, 900], [48, 775], [72, 700], [144, 625], [288, 550]]), sort: 70 },
    { brand: 'Port & Company', style_number: 'PC90YH', slug: 'youth-hoodie', name: 'Youth Hoodie', category: 'youth', style: 'hoodie', garment: 'Youth heavy blend hoodie', blurb: 'Team hoodies for the little ones.', kind: 'apparel', colors: 'Black,Sport Grey,Navy,Royal,Red', sizes: YOUTH, plus_sizes: '', plus_cents: 0, min_qty: 24, breaks: B([[24, 2100], [48, 1900], [72, 1750], [144, 1650], [288, 1550]]), sort: 65 },
    { brand: 'Port Authority', style_number: 'C112', slug: 'trucker-cap', name: 'Trucker Cap', category: 'hats', style: 'hat', garment: 'Mesh back snapback', blurb: 'The classic crew hat.', kind: 'hat', colors: 'Black,Charcoal / Black,Grey / Black,Navy,Loden', sizes: 'One size', plus_sizes: '', plus_cents: 0, min_qty: 12, breaks: B([[12, 2200], [24, 1900], [48, 1700], [72, 1600], [144, 1400]]), sort: 60 },
    { slug: 'flat-bill-snapback', name: 'Flat Bill Snapback', category: 'hats', style: 'hat', garment: '7-panel flat bill', blurb: 'Flat bill, structured front.', kind: 'hat', colors: 'Black,Charcoal,Camo,Grey / Black', sizes: 'One size', plus_sizes: '', plus_cents: 0, min_qty: 12, breaks: B([[12, 2400], [24, 2100], [48, 1900], [72, 1800], [144, 1600]]), sort: 55 },
    { slug: 'performance-cap', name: 'Performance Cap', category: 'hats', style: 'hat', garment: 'Structured, curved bill', blurb: 'Lightweight and sharp.', kind: 'hat', colors: 'Black,Royal Blue,Grey,White', sizes: 'One size', plus_sizes: '', plus_cents: 0, min_qty: 12, breaks: B([[12, 2400], [24, 2100], [48, 1900], [72, 1800], [144, 1600]]), sort: 50 },
    { brand: 'Port & Company', style_number: 'CP90', slug: 'cuffed-beanie', name: 'Cuffed Beanie', category: 'hats', style: 'beanie', garment: 'Knit cuffed beanie', blurb: 'Winter on the job site.', kind: 'hat', colors: 'Black,Charcoal,Navy,Safety Orange', sizes: 'One size', plus_sizes: '', plus_cents: 0, min_qty: 12, breaks: B([[12, 1900], [24, 1600], [48, 1400], [72, 1300], [144, 1100]]), sort: 45 },
  ].map((p) => ({ brand: '', style_number: '', size_prices: null, photo: '', ...p })).forEach((p) => ins.run(p));
}

// Yard signs (added in v2). Seeded on their own so an existing database picks them up too.
if (SEED && !db.prepare("SELECT 1 FROM products WHERE kind = 'sign'").get()) {
  const B = (a) => JSON.stringify(a);
  const ins = db.prepare(`INSERT INTO products (slug,name,category,style,garment,blurb,kind,colors,sizes,plus_sizes,plus_cents,min_qty,breaks,sort,is_sample,brand,style_number,size_prices,photo)
    VALUES (@slug,@name,@category,@style,@garment,@blurb,@kind,@colors,@sizes,@plus_sizes,@plus_cents,@min_qty,@breaks,@sort,1,'','',@size_prices,@photo)`);
  [
    { slug: 'custom-die-cut-yard-signs', name: 'Custom Die Cut Yard Signs', category: 'signs', style: 'sign', garment: 'Full color, cut to the shape of your design', blurb: 'Full color yard signs cut right around your logo or design: circles, shields, trucks, houses, any shape you want.', kind: 'sign', colors: '', sizes: '18" x 24",24" x 24",24" x 36"', plus_sizes: '', plus_cents: 0, min_qty: 10, breaks: B([[10, 2400], [25, 1900], [50, 1600], [100, 1350]]), size_prices: JSON.stringify({ '18" x 24"': 0, '24" x 24"': 300, '24" x 36"': 800 }), photo: '/img/work/cp-property-die-cut-sign.jpg', sort: 40 },
    { slug: 'full-color-yard-signs', name: 'Full Color Yard Signs', category: 'signs', style: 'sign', garment: 'Classic rectangle, full color', blurb: 'The classic yard sign for job sites, open houses, events and campaigns. Bright full color print that reads from the road.', kind: 'sign', colors: '', sizes: '12" x 18",18" x 24",24" x 36"', plus_sizes: '', plus_cents: 0, min_qty: 10, breaks: B([[10, 1600], [25, 1250], [50, 1050], [100, 900]]), size_prices: JSON.stringify({ '12" x 18"': 0, '18" x 24"': 250, '24" x 36"': 700 }), photo: '/img/work/fall-clean-up-yard-sign.jpg', sort: 39 },
  ].forEach((p) => { if (!db.prepare('SELECT 1 FROM products WHERE slug = ?').get(p.slug)) ins.run(p); });
}

if (SEED && db.prepare('SELECT COUNT(*) n FROM team_stores').get().n === 0) {
  const day = (n) => { const d = new Date(Date.now() + n * 864e5); return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); };
  const addStore = db.prepare(`INSERT INTO team_stores (slug,name,org,blurb,accent,status,closes_at,password,listed,name_cents,number_cents,fund_cents,fund_goal_cents,handoff,is_sample)
    VALUES (@slug,@name,@org,@blurb,@accent,'open',@closes_at,@password,@listed,@name_cents,@number_cents,@fund_cents,@fund_goal_cents,@handoff,1)`);
  const addItem = db.prepare(`INSERT INTO team_items (store_id,name,style,garment,design_note,colors,sizes,plus_sizes,plus_cents,price_cents,personalize,sort)
    VALUES (@store_id,@name,@style,@garment,@design_note,@colors,@sizes,@plus_sizes,@plus_cents,@price_cents,@personalize,@sort)`);
  const ADULT = 'S,M,L,XL,2XL,3XL', YOUTH = 'YXS,YS,YM,YL,YXL';
  const a = addStore.run({
    slug: 'hawks-youth-soccer', name: 'Hawks Youth Soccer Fall Gear', org: 'Hawks Youth Soccer', accent: '#1d4ed8',
    blurb: 'Official team gear for the fall season. Order your size, add a name and number, and it all gets printed together.',
    closes_at: day(21), password: null, listed: 1, name_cents: 500, number_cents: 300, fund_cents: 300, fund_goal_cents: 50000,
    handoff: 'Orders are bagged by name and handed out at practice.',
  }).lastInsertRowid;
  [
    { name: 'Team Tee', style: 'tee', garment: 'Soft cotton tee', design_note: 'Front: team logo, 2 colors', colors: 'Royal,White,Sport Grey', sizes: YOUTH + ',' + ADULT, plus_sizes: '2XL,3XL', plus_cents: 200, price_cents: 1800, personalize: 1, sort: 40 },
    { name: 'Team Hoodie', style: 'hoodie', garment: 'Heavy blend pullover hoodie', design_note: 'Front: team logo, 2 colors', colors: 'Royal,Black,Sport Grey', sizes: YOUTH + ',' + ADULT, plus_sizes: '2XL,3XL', plus_cents: 300, price_cents: 3800, personalize: 1, sort: 30 },
    { name: 'Parent Long Sleeve', style: 'longsleeve', garment: 'Heavy cotton long sleeve', design_note: 'Front: "Hawks Soccer Parent"', colors: 'Royal,Black', sizes: ADULT, plus_sizes: '2XL,3XL', plus_cents: 200, price_cents: 2400, personalize: 0, sort: 20 },
    { name: 'Team Beanie', style: 'beanie', garment: 'Knit cuffed beanie', design_note: 'Embroidered team logo', colors: 'Royal,Black', sizes: 'One size', plus_sizes: '', plus_cents: 0, price_cents: 2000, personalize: 0, sort: 10 },
  ].forEach((i) => addItem.run({ ...i, store_id: a }));
  const b = addStore.run({
    slug: 'example-co-crew-store', name: 'Example Co. Crew Store', org: 'Example Co.', accent: '#111111',
    blurb: 'Crew gear for the Example Co. team. The company covers one shirt, extra pieces are on you.',
    closes_at: day(14), password: 'crew2026', listed: 0, name_cents: 0, number_cents: 0, fund_cents: 0, fund_goal_cents: 0,
    handoff: 'Delivered to the shop office. Your foreman hands them out.',
  }).lastInsertRowid;
  [
    { name: 'Crew Tee', style: 'tee', garment: 'Soft cotton tee', design_note: 'Left chest + full back', colors: 'Black,Safety Green,Charcoal', sizes: ADULT, plus_sizes: '2XL,3XL', plus_cents: 200, price_cents: 1400, personalize: 0, sort: 30 },
    { name: 'Crew Hoodie', style: 'hoodie', garment: 'Heavy blend pullover hoodie', design_note: 'Left chest + full back', colors: 'Black,Charcoal', sizes: ADULT, plus_sizes: '2XL,3XL', plus_cents: 300, price_cents: 3200, personalize: 0, sort: 20 },
    { name: 'Crew Trucker Cap', style: 'hat', garment: 'Mesh back snapback', design_note: 'Leather patch on the front', colors: 'Black,Charcoal / Black', sizes: 'One size', plus_sizes: '', plus_cents: 0, price_cents: 2200, personalize: 0, sort: 10 },
  ].forEach((i) => addItem.run({ ...i, store_id: b }));
}

// Remove abandoned cart items after 14 days (their logo files are cleaned up by the store module)
db.exec(`DELETE FROM cart_items WHERE created_at < datetime('now','-14 days')`);

module.exports = db;
