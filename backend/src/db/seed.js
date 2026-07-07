require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { Pool } = require('pg');

// Seed uses direct connection (port 5432), not pgbouncer
const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false }, max: 1 });

async function seed() {
  const client = await pool.connect();
  try {
    console.log('Seeding e-Merkato demo data...');
    await client.query('BEGIN');

    // Demo users
    await client.query(`
      INSERT INTO users (tg_user_id, first_name, last_name, username, tier) VALUES
        (12893412, 'Mike', 'Fikadu', 'Mike_Fikadu', 'standard'),
        (98760001, 'Selam', 'Tadesse', 'Selam_T', 'gold'),
        (98760002, 'Abebe', 'Girma', 'BoleAppleAdmin', 'verified_seller'),
        (98760003, 'Tigist', 'Kebede', 'ShiroMedaAdmin', 'verified_seller'),
        (98760004, 'Dawit', 'Alemu', 'KaffaRoastAdmin', 'verified_seller')
      ON CONFLICT (tg_user_id) DO NOTHING
    `);

    // Demo stores
    const storesRes = await client.query(`
      INSERT INTO stores (tg_group_id, tg_channel_username, store_name, store_slug, admin_tg_user_id, description,
        location_sub_city, location_woreda, physical_address, business_phone,
        telebirr_merchant_id, cbe_account_number, status, verified_badge, rating, rating_count, total_orders)
      VALUES
        (-1001112223334, 'BoleAppleDeals', 'Bole Apple & Tech Hub', 'bole-apple-tech', 98760002,
         'Premium Apple products and Sony electronics. Verified warranty on all items.',
         'Bole', 'Woreda 03', 'Near Edna Mall, Bole Sub-City, Addis Ababa', '+251 911 100 001',
         '891204', '100023491823', 'verified', true, 4.90, 1200, 3450),
        (-1001112223335, 'ShiroMedaTextile', 'Shiro Meda Heritage Textile', 'shiro-meda-textile', 98760003,
         'Authentic Ethiopian traditional clothing. Habesha Kemis, Gabi, Netela, and more.',
         'Gulele', 'Woreda 01', 'Shiro Meda Main Street, Gulele Sub-City, Addis Ababa', '+251 911 100 002',
         '772101', '100099182731', 'verified', true, 4.80, 850, 2100),
        (-1001112223336, 'KaffaRoastery', 'Kaffa & Sidama Direct Roastery', 'kaffa-sidama-roastery', 98760004,
         'Farm-to-cup Ethiopian specialty coffee. Single origin Sidama, Yirgacheffe, and Kaffa roasts.',
         'Kirkos', 'Woreda 07', 'Kasanchis Area, Kirkos Sub-City, Addis Ababa', '+251 911 100 003',
         '551203', '100077182931', 'verified', true, 5.00, 5100, 8900),
        (-1001112223337, 'MerkatoKicks', 'Merkato Premium Footwear', 'merkato-footwear', 98760003,
         'Nike, Adidas, Puma. Genuine footwear imported and distributed from Merkato central.',
         'Addis Ketema', 'Woreda 05', 'Tana Mall, Merkato, Addis Ketema', '+251 911 100 004',
         '661290', '100044192834', 'verified', true, 4.70, 3400, 6700)
      ON CONFLICT (store_slug) DO NOTHING
      RETURNING store_id, store_slug
    `);

    const storeMap = {};
    for (const row of storesRes.rows) storeMap[row.store_slug] = row.store_id;

    // Policies for each store
    for (const [slug, storeId] of Object.entries(storeMap)) {
      let policy = {};
      if (slug === 'bole-apple-tech') {
        policy = { return_policy_type: '3_day_warranty', custom_policy_text: 'All products carry a 3-Day Replacement Warranty from date of delivery. Present QR receipt for warranty claims.', addis_delivery_fee: 200, regional_dispatch_fee: 450 };
      } else if (slug === 'shiro-meda-textile') {
        policy = { return_policy_type: '7_day_free', custom_policy_text: 'We accept free returns and size exchanges within 7 days. Item must be in original condition.', addis_delivery_fee: 150, regional_dispatch_fee: 350 };
      } else if (slug === 'kaffa-sidama-roastery') {
        policy = { return_policy_type: 'fresh_guarantee', custom_policy_text: 'Freshness guaranteed. If you receive a stale or damaged product, full refund or replacement.', addis_delivery_fee: 100, regional_dispatch_fee: 300 };
      } else {
        policy = { return_policy_type: 'size_exchange', custom_policy_text: 'Size exchange allowed within 24 hours of delivery. Must be unworn. No cash refund.', addis_delivery_fee: 150, regional_dispatch_fee: 400 };
      }
      await client.query(`
        INSERT INTO seller_policies (store_id, return_policy_type, custom_policy_text, addis_delivery_fee, regional_dispatch_fee)
        VALUES ($1, $2, $3, $4, $5) ON CONFLICT (store_id) DO NOTHING
      `, [storeId, policy.return_policy_type, policy.custom_policy_text, policy.addis_delivery_fee, policy.regional_dispatch_fee]);
    }

    // Products
    if (storeMap['bole-apple-tech']) {
      await client.query(`
        INSERT INTO products (store_id, title, description, price_etb, compare_price, sku, stock_quantity, category, sub_category, tags, is_published, is_featured, rating, rating_count, order_count)
        VALUES
          ($1, 'Apple iPhone 15 Pro Max (256GB - Titanium)', 'Latest Apple iPhone 15 Pro Max. 6.7" Super Retina XDR display, A17 Pro chip, 48MP main camera. Titanium chassis. Comes with 1 year Apple warranty.', 165000, 170000, 'AAPL-IP15PM-256-TI', 8, 'electronics', 'smartphones', ARRAY['apple','iphone','smartphone','premium'], true, true, 4.9, 312, 845),
          ($1, 'Sony WH-1000XM5 Noise Cancelling Headphones', 'Industry-leading noise cancellation. 30 hours battery. Crystal clear call quality. Comfortable over-ear design. Comes in Midnight Black.', 28500, 32000, 'SONY-WH1000XM5-BLK', 15, 'electronics', 'audio', ARRAY['sony','headphones','audio','wireless'], true, false, 4.8, 180, 340),
          ($1, 'Samsung 65" QLED 4K Smart TV (QN65Q80C)', 'Quantum HDR 4K resolution, 120Hz refresh, built-in Alexa & Google Assistant. Slim design. Perfect for Ethiopian living rooms.', 125000, 135000, 'SAMS-65Q80C', 3, 'electronics', 'tv', ARRAY['samsung','tv','4k','smart-tv'], true, false, 4.7, 45, 62)
      `, [storeMap['bole-apple-tech']]);
    }

    if (storeMap['shiro-meda-textile']) {
      await client.query(`
        INSERT INTO products (store_id, title, description, price_etb, sku, stock_quantity, category, sub_category, tags, is_published, is_featured, rating, rating_count, order_count)
        VALUES
          ($1, 'Traditional Habesha Kemis – Women (Full Set)', 'Hand-woven 100% Ethiopian cotton. Traditional Tilet border design. Available in sizes S/M/L/XL. Includes matching Netela scarf.', 4500, 'SHIRO-HK-W-001', 40, 'fashion', 'traditional', ARRAY['habesha','kemis','traditional','women'], true, true, 4.9, 620, 1200),
          ($1, 'Ethiopian Men''s Linen Suit (Habesha Kemis for Men)', 'White linen with hand-embroidered collar and cuff. 100% Ethiopian artisan made. Sizes: M, L, XL, XXL.', 3800, 'SHIRO-HK-M-001', 25, 'fashion', 'traditional', ARRAY['habesha','men','linen','traditional'], true, false, 4.7, 310, 540),
          ($1, 'Premium Ethiopian Gabi / Blanket (Handmade)', 'Traditional hand-loomed cotton Gabi. Extra warm, double layered weave. Perfect gift for all occasions. One size fits all.', 1800, 'SHIRO-GABI-001', 60, 'fashion', 'accessories', ARRAY['gabi','blanket','handmade','gift'], true, false, 4.8, 220, 490)
      `, [storeMap['shiro-meda-textile']]);
    }

    if (storeMap['kaffa-sidama-roastery']) {
      await client.query(`
        INSERT INTO products (store_id, title, description, price_etb, sku, stock_quantity, category, sub_category, tags, is_published, is_featured, rating, rating_count, order_count)
        VALUES
          ($1, 'Organic Sidama Washed Coffee Beans (1kg Premium)', 'Direct farm-to-cup. Washed process. Flavor notes: jasmine, blackberry, citrus. Roasted fresh every week in Kirkos.', 950, 'KAFFA-SID-W-1KG', 200, 'groceries', 'coffee', ARRAY['coffee','sidama','organic','premium'], true, true, 5.0, 1850, 4200),
          ($1, 'Yirgacheffe Natural Grade 1 Coffee (500g)', 'Ethiopia''s most celebrated terroir. Natural process, sun-dried. Flavor: blueberry, dark chocolate, red wine. Single origin.', 650, 'KAFFA-YIR-N-500G', 150, 'groceries', 'coffee', ARRAY['coffee','yirgacheffe','natural','single-origin'], true, false, 5.0, 1200, 2800),
          ($1, 'Kaffa Forest Wild Coffee (250g) – Rare Reserve', 'Wild-harvested from Kaffa forest, birthplace of coffee. Extremely limited stock. Complex, earthy, ancient forest notes.', 1200, 'KAFFA-FOR-WILD-250G', 30, 'groceries', 'coffee', ARRAY['coffee','kaffa','wild','rare','forest'], true, true, 5.0, 480, 750)
      `, [storeMap['kaffa-sidama-roastery']]);
    }

    if (storeMap['merkato-footwear']) {
      await client.query(`
        INSERT INTO products (store_id, title, description, price_etb, sku, stock_quantity, category, sub_category, tags, is_published, is_featured, rating, rating_count, order_count)
        VALUES
          ($1, 'Nike Air Zoom Pegasus 40 Running Shoes', 'Genuine Nike. Breathable mesh upper, React foam cushioning. Available: UK7, UK8, UK9, UK10, UK11. Colors: White/Blue, Black.', 6800, 'NIKE-PEGASUS-40', 35, 'fashion', 'footwear', ARRAY['nike','running','shoes','genuine'], true, true, 4.7, 890, 1650),
          ($1, 'Adidas Ultraboost 23 (Men & Women)', 'Premium Adidas Boost cushioning. Primeknit+ upper. 11 color options. Sizes UK4-UK12. Perfect for daily runs or casual wear.', 7200, 'ADIDAS-UB23', 28, 'fashion', 'footwear', ARRAY['adidas','ultraboost','shoes','premium'], true, false, 4.8, 450, 780),
          ($1, 'Puma RS-X Retro Sneakers (Unisex)', 'Chunky retro design. RS foam technology. 8 colorways available. Trending street style. Sizes UK4-UK12.', 4500, 'PUMA-RSX-UNI', 45, 'fashion', 'footwear', ARRAY['puma','sneakers','retro','casual'], true, false, 4.6, 320, 650)
      `, [storeMap['merkato-footwear']]);
    }

    // Demo delivery address for Mike
    await client.query(`
      INSERT INTO delivery_addresses (tg_user_id, label, sub_city, woreda, house_number, landmark, phone, is_default)
      VALUES
        (12893412, 'Home', 'Bole', 'Woreda 03', 'House 412', 'Near Edna Mall', '+251 911 234 567', true),
        (12893412, 'Work', 'Kirkos', 'Woreda 02', 'Office B5', 'Jupiter Hotel Area', '+251 911 234 567', false)
      ON CONFLICT DO NOTHING
    `);

    await client.query('COMMIT');
    console.log('✅ Seed data inserted successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
