Product Requirements Document (PRD)
Telegram E-Commerce Mini App with Decentralized Google Drive Storage & Social Automation
Version: 1.0
Date: [Insert Date]
Status: Draft for Approval

1. Introduction & Background
Currently, sellers post product images and details in a Telegram group. A bot captures these messages and displays them in the "Home" section of a Telegram Mini App.

The Problem:

Product images are stored on Telegram's volatile servers (temporary file IDs, compression).

Sellers lack a structured dashboard to manage inventory or analyze sales.

Marketing relies on manual reposting to other platforms (Instagram).

The Solution:
Integrate Google Drive (per seller) as the primary asset and data management layer. Sellers will use Google Sheets (Excel) as their product database and Drive folders for high-resolution images. This unlocks automated analytics, AI-generated marketing content, and direct Instagram publishing.

2. Project Vision & Objectives
Vision: To become a fully autonomous "Commerce Operating System" for Telegram sellers, handling everything from product listing to multi-channel marketing.

Objectives:

Decentralize Storage: Shift media and data storage from the platform to the seller's personal 15GB Google Drive (eliminating hosting costs for the platform).

Enhance Product Quality: Serve high-resolution, uncompressed images to the Mini App.

Automate Marketing: Automatically publish new arrivals from the Drive catalog to the seller's Instagram Business feed.

Empower Analytics: Provide AI-driven seller dashboards based on their historical sales data (Excel).

3. Scope
In-Scope
Google OAuth 2.0 integration (per seller).

Bot modification: Upload images to Drive & append metadata to Google Sheets.

Mini App modification: Fetch products directly from the seller's Google Sheet.

Automation workflow (n8n) to post products to Instagram.

Basic inventory management (Stock level alerts).

Out-of-Scope (Phase 2)
Direct Shopify/WooCommerce integration.

Automated payment processing within the Mini App.

AI-generated video ads (coming in Phase 3).

4. User Personas
The Seller (Power User): A small business owner who is active in the Telegram group. Needs to manage inventory quickly, avoid manual uploading to multiple channels, and get insights into what sells best.

The Customer (Buyer): Visits the Mini App to browse high-quality product images, check prices, and contact the seller.

The Platform Admin: Manages the bot backend, monitors API rate limits, and ensures uptime.

5. Functional Requirements (FRs)
FR1: Seller Onboarding & Google Drive Authorization
Requirement: Sellers must connect their Google Drive via the Mini App settings.

Flow:

Mini App opens Google OAuth screen.
Seller grants drive.file and spreadsheets permissions.
Backend captures refresh_token and stores it linked to telegram_user_id.
Acceptance: Seller sees a green "Connected" status on their dashboard.

FR2: Product Listing (Telegram Group -> Drive)
Requirement: The bot captures the image and caption from the group.

Logic:

Bot downloads the image.
Bot uploads the image to the seller's specific Drive folder (e.g., /My-Store/product-images/SKU001.jpg).
Bot appends a new row to the seller's Google Sheet with columns: SKU, Name, Price, Stock, Image_Filename, Description.
Acceptance: Seller receives a reply: "✅ Product saved to Drive catalog!"

FR3: Mini App "Home" Data Retrieval
Requirement: The Mini App displays the seller's catalog.

Logic:

App requests products from backend.
Backend fetches rows from the seller's Google Sheet.
Backend generates temporary (15-min) Drive download URLs for the images.
Acceptance: Images load in HD quality under 2 seconds.

FR4: Instagram Automation (Marketing)
Requirement: New products are automatically posted to the seller's Instagram.

Logic (via n8n):

Trigger: New row detected in Google Sheet (where Posted_to_IG is false).
Fetch Image from Drive -> Upload to temporary public URL.
AI Step: Send Image + Data to GPT-4 Vision to generate a caption with hashtags.
Posting: Call Instagram Graph API to create and publish the media.
Update Google Sheet column Posted_to_IG to TRUE.
FR5: Analytics & AI Querying (The "Oracle Bot")
Requirement: Sellers can query their sales/inventory data via Telegram.

Logic:

Seller sends /analytics How many sneakers did I sell this month?
Bot queries the Google Sheet history.
Bot generates a report (or uses GPT to synthesize the data).
Acceptance: Seller receives a text report with numbers.

6. Non-Functional Requirements (NFRs)
Performance: The "Home" section must load in < 2 seconds. Drive API calls should be cached (Redis) to avoid throttling.

Security:

OAuth tokens must be encrypted at rest in the database.

Backend must validate seller identity before executing any Drive read/write operations.

Scalability: The system should handle up to 500 concurrent sellers without hitting rate limits.

Rate Limits:

Google Drive: We must implement exponential backoff and caching.

Instagram: Respect the limit of 25 posts/account/day.

Compliance: Sellers must explicitly consent to the OAuth terms and Instagram publishing permissions.

7. Technical Stack Summary
Layer	Technology
Telegram Bot	Python 3.11 (python-telegram-bot) / Node.js
Backend API	FastAPI (Python) / Express (Node)
Auth	OAuth 2.0 (Google Client Library)
Database	PostgreSQL (Stores Refresh Tokens, Settings, DB Caching)
Cache	Redis (Image URL caching, API response caching)
Workflow Automation	n8n (Self-hosted)
AI Models	OpenAI GPT-4 Vision (Captions & Ads)
Image Serving	Backend Proxy (to avoid CORS/exposure)
8. Data Flow Diagram (High-Level)
User Action: Seller posts Image + "Shoes $45 10stock" in Group.

Bot Action: Parses text -> Uploads Image to Drive -> Writes Shoes, 45, 10 to Google Sheet.

Automation (n8n): Watches Sheet -> Triggers AI Caption -> Publishes to Instagram.

Customer Action: Opens Mini App -> Backend reads Sheet -> Returns Product list & Proxy URLs.

9. Implementation Milestones (8 Weeks)
Milestone	Timeframe	Deliverables
M1: Drive Integration	Week 1-2	OAuth flow working. Bot uploads images to Drive.
M2: Mini App Upgrade	Week 3	Home page reads from Google Sheet (cached). High-res images rendered.
M3: Instagram Automation	Week 4-5	n8n workflow deployed. Tested with test Instagram Business accounts.
M4: AI Features (Analytics)	Week 6	Bot responds to /analytics queries by parsing Sheet data.
M5: Beta Launch	Week 7-8	Onboard 5 real sellers. Monitor rate limits and optimize caching.
10. Risks & Mitigation Strategies
Risk	Impact	Mitigation
Sellers struggle with OAuth setup	High	Build a guided "Connect Drive" flow with visual screenshots inside the Mini App.
Google Drive API Rate Limits	Medium	Implement aggressive caching (Redis) for product data (TTL: 5 mins).
Instagram Posting Fails	Medium	Implement a retry queue with exponential backoff. Store failed posts in a "Draft" state.
Unstructured Captions (NLP fails)	Medium	Educate sellers on a standard format (e.g., Product | Price | Stock). Use the bot to prompt if the regex fails.
Refresh Token Expiry	High	Set up email/alerts to sellers if the token is revoked. Provide a "Reconnect" button.
11. Success KPIs
Seller Adoption: 80% of active sellers connect their Drive within the first month of release.

Bot Speed: Message-to-Drive upload time < 3 seconds.

Marketing Reach: 200+ Instagram posts generated via the automation in the first quarter.

System Health: 99.9% uptime for the Drive API authentication flow.

12. Next Steps for the AI / Dev Team
Obtain API Keys: Set up the Google Cloud Project and Facebook Developer accounts.

Scaffold the Database: Create the Merchants table with fields for refresh_token and folder_id.

Implement the Proxy Server: The backend must handle /get-image/{file_id} to fetch bytes from Drive and pass them to the Mini App.

Build the n8n Template: Create a reusable workflow for the Instagram publisher.

