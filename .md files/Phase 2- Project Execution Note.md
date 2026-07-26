Project Execution Note: Telegram E-Commerce Mini App with Google Drive Integration
1. Executive Summary
This project extends an existing Telegram-based e-commerce system where sellers post products in a group, and a bot displays them in a Mini App "Home" section. The upgrade introduces Google Drive as the primary storage layer for product images and structured product data (Excel/Google Sheets), enabling:

Decentralized storage – each seller uses their own 15GB Google Drive

AI-powered analytics – seller dashboards with data insights

Automated social media marketing – Instagram post publishing from product data

Scalable architecture – zero storage costs for the platform owner

2. System Architecture Overview
text
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SELLER GROUP (Telegram)                       │
│  Seller posts: Image + Caption (e.g., "Black Sneakers - $45 - 10 in stock")│
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TELEGRAM BOT (Python)                              │
│  • Parses caption (regex/command-based)                                   │
│  • Downloads image bytes                                                  │
│  • Uploads image to seller's Google Drive                                 │
│  • Appends product data to seller's Google Sheet                          │
│  • Replies with confirmation                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SELLER'S GOOGLE DRIVE (Per Seller)                      │
│  /My-Store-Data/                                                          │
│  ├── products.xlsx (or Google Sheet)                                     │
│  │   Columns: SKU | Name | Price | Stock | Image_Filename | Description   │
│  └── /product-images/                                                    │
│       ├── SKU001.jpg                                                     │
│       └── SKU002.png                                                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
┌───────────────────────────────┐ ┌───────────────────────────────────────────┐
│    MINI APP "HOME" SECTION    │ │        AUTOMATION LAYER (n8n)             │
│  • Fetches product data from  │ │  • Detects new rows in Google Sheet       │
│    seller's Google Sheet      │ │  • Generates AI captions (GPT-4 Vision)   │
│  • Displays images via proxy  │ │  • Publishes to Instagram Business Feed   │
│    or temporary Drive URLs    │ │  • Marks rows as "posted"                 │
└───────────────────────────────┘ └───────────────────────────────────────────┘
                                                    │
                                                    ▼
                                      ┌─────────────────────────┐
                                      │   INSTAGRAM BUSINESS   │
                                      │   ACCOUNT (Seller's)   │
                                      └─────────────────────────┘
3. Component Specifications
3.1 Telegram Bot (Existing - Modified)
Current State: Bot parses group messages, extracts product data, and displays in Mini App.

Changes Required:

Module	Current Behavior	New Behavior
Message Handler	Saves Telegram file_id to DB	Downloads image → Uploads to seller's Drive → Saves Drive file_id to DB
Product Storage	Stores metadata in local DB	Stores metadata in local DB + appends row to seller's Google Sheet
Image Serving	Returns Telegram file_id	Returns Drive file_id + generates temporary URLs
New Dependencies:

google-api-python-client – Google Drive & Sheets API

google-auth-oauthlib – OAuth 2.0 authentication

openpyxl or pandas – Excel file parsing (if using .xlsx)

3.2 Google Drive Integration (New)
3.2.1 OAuth 2.0 Setup (Per Seller)
Each seller must authorize the bot to access their Drive:

Create Google Cloud Project – Enable Drive API and Sheets API

Create OAuth 2.0 Credentials – Download credentials.json

Implement Authorization Flow in Mini App:

text
https://accounts.google.com/o/oauth2/v2/auth?
  client_id=YOUR_CLIENT_ID&
  redirect_uri=YOUR_BACKEND_CALLBACK&
  response_type=code&
  scope=https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets&
  access_type=offline&
  prompt=consent
Store Refresh Token – Linked to seller's telegram_user_id

Critical: Request access_type=offline to receive a refresh_token for long-term access.

3.2.2 Folder Structure (Per Seller)
text
/{Seller_Store_Name}/
├── products.xlsx (or Google Sheet)
└── product-images/
Google Sheet Schema:

Column	Type	Description
SKU	String	Unique product identifier
Product_Name	String	Product title
Price	Number	Selling price
Stock	Integer	Available quantity
Image_Filename	String	Filename in /product-images/ folder
Description	Text	Product description
Posted_To_Instagram	Boolean	Flag for automation
Date_Added	Timestamp	Auto-populated
3.2.3 Upload Logic (Bot Handler)
python
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from google.oauth2.credentials import Credentials

def get_drive_service(merchant_id):
    merchant = db.get_merchant(merchant_id)
    creds = Credentials(
        token=merchant.access_token,
        refresh_token=merchant.refresh_token,
        client_id=CLIENT_ID,
        client_secret=CLIENT_SECRET,
        token_uri='https://oauth2.googleapis.com/token'
    )
    if creds.expired:
        creds.refresh(Request())
        db.update_access_token(merchant_id, creds.token)
    return build('drive', 'v3', credentials=creds)

def upload_product_image(merchant_id, image_bytes, sku):
    service = get_drive_service(merchant_id)
    media = MediaFileUpload(image_bytes, mimetype='image/jpeg')
    file_metadata = {
        'name': f'{sku}.jpg',
        'parents': [MERCHANT_IMAGE_FOLDER_ID]
    }
    file = service.files().create(
        body=file_metadata,
        media_body=media,
        fields='id'
    ).execute()
    return file.get('id')
3.2.4 Google Sheets Append Logic
python
from googleapiclient.discovery import build

def append_product_to_sheet(merchant_id, product_data):
    service = build('sheets', 'v4', credentials=get_drive_service(merchant_id))
    body = {
        'values': [[
            product_data['sku'],
            product_data['name'],
            product_data['price'],
            product_data['stock'],
            product_data['image_filename'],
            product_data['description'],
            'FALSE',  # Posted_To_Instagram
            datetime.now().isoformat()
        ]]
    }
    service.spreadsheets().values().append(
        spreadsheetId=MERCHANT_SHEET_ID,
        range='Products!A1',
        valueInputOption='RAW',
        insertDataOption='INSERT_ROWS',
        body=body
    ).execute()
3.3 Mini App "Home" Section (Modified)
Current: Fetches products from local DB with Telegram file_id.

New: Fetches products from seller's Google Sheet + generates image URLs.

API Endpoint: GET /store/{merchant_id}/products

Response:

json
{
  "products": [
    {
      "sku": "SKU001",
      "name": "Black Sneakers",
      "price": 45.00,
      "stock": 10,
      "image_url": "https://your-api.com/images/{merchant_id}/{file_id}",
      "description": "Premium black leather sneakers"
    }
  ]
}
Image Proxy Endpoint: GET /images/{merchant_id}/{file_id}

Fetches image from Drive using seller's credentials

Returns image with proper Content-Type header

Implements caching (Redis, 5-minute TTL)

3.4 Instagram Automation (New)
3.4.1 Prerequisites
Seller must have an Instagram Business or Creator account

Seller must connect Instagram to a Facebook Page

Seller must authorize the app via Facebook Login

Rate limit: ~25 posts per 24 hours per account

3.4.2 n8n Workflow (Recommended Approach)
n8n is an open-source automation tool that connects Google Sheets, Google Drive, and Instagram.

Workflow Steps:

Schedule Trigger – Runs every 15 minutes

Google Sheets Node – Fetches rows where Posted_To_Instagram = FALSE

HTTP Request Node – Fetches image from Google Drive

Upload to Temporary URL – Images must be publicly accessible for Instagram API

AI Caption Generation (Optional) – Uses GPT-4 Vision to generate captions from product image + data

Create Media Container – Instagram Graph API: POST /{ig-user-id}/media

Publish Post – Instagram Graph API: POST /{ig-user-id}/media_publish

Google Sheets Node – Updates Posted_To_Instagram = TRUE

3.4.3 Instagram Graph API - Python Implementation
python
import requests

def create_media_container(instagram_business_id, image_url, caption):
    url = f"https://graph.facebook.com/v18.0/{instagram_business_id}/media"
    params = {
        'image_url': image_url,
        'caption': caption,
        'access_token': SELLER_INSTAGRAM_TOKEN
    }
    response = requests.post(url, params=params)
    return response.json()['id']

def publish_media(instagram_business_id, creation_id):
    url = f"https://graph.facebook.com/v18.0/{instagram_business_id}/media_publish"
    params = {
        'creation_id': creation_id,
        'access_token': SELLER_INSTAGRAM_TOKEN
    }
    response = requests.post(url, params=params)
    return response.json()
3.5 AI Features (Future-Phased)
Phase 1: AI Caption Generation
Model: GPT-4 Vision (multimodal)

Input: Product image (from Drive) + product data (from Sheet)

Output: 3-5 variations of Instagram captions with hashtags

Implementation: n8n HTTP Request node → OpenAI API

Phase 2: Seller Analytics Dashboard
Data Source: Seller's Google Sheet (historical product data)

Metrics: Sales velocity, inventory turnover, price elasticity

Features:

"Oracle Bot" – sellers ask: "How many blue sneakers under $50 did I sell?"

Inventory alerts – "⚠️ Black Sneakers: 5 units left. Restock recommended."

Phase 3: Automated Ad Creation
Input: Product image + data from Drive/Sheet

Process: Generate multiple ad variations (different crops, backgrounds, copy)

Output: Ready-to-post ads saved back to Drive /ads/ folder

4. Database Schema
Table: merchants

Column	Type	Description
id	UUID	Primary key
telegram_user_id	BIGINT	Unique Telegram user ID
telegram_chat_id	BIGINT	Group chat ID (for private groups)
store_name	VARCHAR(255)	Seller's store name
google_refresh_token	TEXT	OAuth refresh token
google_drive_folder_id	VARCHAR(255)	Root folder ID for this seller
google_sheet_id	VARCHAR(255)	Product sheet ID
instagram_business_id	VARCHAR(255)	Instagram Business account ID
instagram_access_token	TEXT	Facebook/Instagram token
created_at	TIMESTAMP	Record creation date
Table: products (lightweight cache - source of truth is Google Sheet)

Column	Type	Description
id	UUID	Primary key
merchant_id	UUID	Foreign key to merchants
sku	VARCHAR(100)	Product SKU
drive_file_id	VARCHAR(255)	Image file ID in Drive
name	VARCHAR(255)	Product name
price	DECIMAL(10,2)	Price
stock	INTEGER	Quantity
last_synced_at	TIMESTAMP	Last cache refresh
5. Implementation Roadmap
Phase 1: Core Drive Integration (Weeks 1-2)
Task	Owner	Dependencies
Create Google Cloud Project + enable APIs	DevOps	-
Build OAuth 2.0 "Connect Drive" flow in Mini App	Frontend	Google Cloud setup
Implement token storage & refresh logic	Backend	-
Modify bot to upload images to Drive	Backend	Token logic
Modify bot to append to Google Sheets	Backend	Token logic
Update Mini App "Home" to use Drive images	Frontend	Backend API
Phase 2: Instagram Automation (Weeks 3-4)
Task	Owner	Dependencies
Set up Facebook Developer app + Instagram Graph API	DevOps	-
Build Instagram OAuth "Connect" flow	Frontend	Facebook app
Deploy n8n instance (self-hosted or cloud)	DevOps	-
Build n8n workflow: Sheet → Drive → Instagram	Backend	n8n, API tokens
Test with test Instagram Business account	QA	All above
Phase 3: AI Features (Weeks 5-6)
Task	Owner	Dependencies
Integrate OpenAI API (GPT-4 Vision)	Backend	OpenAI API key
Build AI caption generation node in n8n	Backend	OpenAI integration
Build seller analytics dashboard	Frontend	Google Sheets data
Implement "Oracle Bot" Q&A feature	Backend	RAG + Sheets
Phase 4: Scaling & Optimization (Week 7+)
Task	Owner	Dependencies
Implement Redis caching for Drive images	Backend	Redis
Add webhook support for Sheet changes	Backend	Google Drive API
Build product edit/delete commands in group	Backend	-
Monitor API rate limits (Drive, Instagram)	DevOps	-
6. Technical Requirements
6.1 Backend Stack
Component	Technology	Version
Language	Python	3.10+
Framework	FastAPI or Flask	Latest
Database	PostgreSQL	14+
Cache	Redis	7+
Task Queue	Celery	5+
Google APIs	google-api-python-client	Latest
6.2 Frontend (Mini App)
Component	Technology
Framework	React / Vue / Vanilla JS
Telegram SDK	Telegram WebApp SDK
Image Loading	Lazy loading with placeholder
6.3 Automation
Component	Technology
Workflow Automation	n8n (self-hosted)
AI	OpenAI API (GPT-4 Vision)
6.4 Infrastructure
Component	Recommendation
Hosting	AWS / Google Cloud / Railway
Environment Variables	All API keys, tokens, secrets
Logging	Structured logging with correlation IDs
Monitoring	Sentry for errors, Prometheus for metrics
7. Critical Considerations
7.1 Security
Never expose client_secret or refresh tokens in frontend

Always validate that the merchant requesting data owns the stored refresh token

Use HTTPS for all communications

Implement rate limiting on API endpoints

7.2 Rate Limits
API	Limit	Mitigation
Google Drive	1,000 requests/user/100 sec	Implement exponential backoff, caching
Google Sheets	500 requests/project/100 sec	Batch operations
Instagram Graph	~25 posts/24 hrs/account	Queue posts, schedule wisely
7.3 Migration
Add storage_source column to products table (telegram | drive)

New products use drive

Existing products continue using Telegram file_id

Optional: Run background migration script to migrate old images to Drive

7.4 Instagram Requirements
Only Business or Creator accounts can post via API

Images must be publicly accessible (use temporary URLs or proxy)

No clickable links in captions (use "Link in bio" workaround)

8. Testing Strategy
8.1 Unit Tests
Google Drive upload function

Google Sheets append function

Instagram media container creation

Caption parsing from group messages

8.2 Integration Tests
End-to-end: Group message → Drive upload → Sheet append → Mini App display

End-to-end: Sheet row → n8n → Instagram post

8.3 Test Accounts
Google: Create test Gmail accounts with Drive

Instagram: Create test Business accounts (use Facebook Developer sandbox)

Telegram: Create test bot and private group

9. Success Metrics
Metric	Target
Bot response time (message → Drive upload)	< 3 seconds
Mini App Home load time	< 2 seconds
Instagram post automation success rate	> 95%
Seller OAuth connection success rate	> 90%
System uptime	99.5%
10. References & Resources
Google Drive API: Upload file data

Google Sheets API: Append values

Instagram Graph API: Publish photo

n8n Instagram Workflow: Automate carousel posts

OpenAI Vision API: Generate captions from images

END OF PROJECT EXECUTION NOTE

DOCUMENT 2: PRODUCT REQUIREMENTS DOCUMENT (PRD)
(Copy everything below from the "START" to "END" lines)

START OF PRODUCT REQUIREMENTS DOCUMENT

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