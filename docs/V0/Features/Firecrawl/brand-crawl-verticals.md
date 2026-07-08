# TRIBEv2 — Vertical-Specific Brand Asset Crawl Guide
> Groups 6–17 · Runs AFTER brand-crawl-universal.md · Activated by detected vertical
> Used by: Brand Extraction Feature · Firecrawl API v2

---

## How This File Works

This file is the second pass in the TRIBEv2 brand extraction pipeline. It runs only after `brand-crawl-universal.md` completes and a vertical has been detected. Each section below is a self-contained crawl plan for one vertical. Load only the section matching the brand's detected vertical.

**Cost estimate per vertical:** 15–40 additional credits depending on depth  
**Output:** Appended to `brand_universal.json` as `vertical_assets: { ... }`

---

## Shared Vertical Scrape Config (Apply to All Calls Below)

```json
{
  "onlyMainContent": true,
  "onlyCleanContent": true,
  "blockAds": true,
  "proxy": "auto",
  "waitFor": 1200,
  "timeout": 60000,
  "removeBase64Images": true,
  "location": { "country": "US", "languages": ["en-US"] }
}
```

> Only override these when specifically noted in a vertical section.

---

---

# G6 — D2C, E-Commerce & Fashion

**Triggered by:** Schema.org `Product`, `Store`, `ClothingStore`, `OnlineStore`  
**Key pages:** `/products`, `/shop`, `/collections`, PDPs

---

## G6-Pass-1 — Product Catalog

```json
POST https://api.firecrawl.dev/v2/scrape
{
  "url": "https://[BRAND_DOMAIN]/products",
  "formats": [
    { "type": "markdown" },
    { "type": "images" },
    { "type": "links" },
    {
      "type": "json",
      "prompt": "SEE PROMPT: G6-P1-CATALOG",
      "schema": "SEE SCHEMA: G6-S1-CATALOG"
    }
  ]
}
```

### Prompt G6-P1-CATALOG

```
You are extracting product catalog data from an e-commerce or D2C brand's product listing page.

Extract:

1. PRODUCT_NAMES: All product names visible on this listing page (array, up to 30)
2. COLLECTION_NAMES: Any collection, category, or product line names (array)
3. PRICE_RANGE: The lowest and highest prices shown (e.g. "$29 – $299")
4. SALE_INDICATORS: Any sale, discount, or promo language visible (e.g. "20% off", "BOGO")
5. PRODUCT_CARD_URLS: URLs of individual product detail pages (array, up to 15 — prioritize bestsellers or featured)
6. SUBSCRIPTION_OR_BUNDLE: Any subscription, bundle, or subscription-save options mentioned
7. SHIPPING_HOOK: Any free shipping, fast delivery, or fulfillment promise shown in catalog header/banner
8. LABEL_TAGS: Any product tags shown on cards (e.g. "New", "Bestseller", "Limited", "Vegan", "Organic")
```

### Schema G6-S1-CATALOG

```json
{
  "type": "object",
  "properties": {
    "product_names": { "type": "array", "items": { "type": "string" } },
    "collection_names": { "type": "array", "items": { "type": "string" } },
    "price_range": { "type": ["string", "null"] },
    "sale_indicators": { "type": "array", "items": { "type": "string" } },
    "product_card_urls": { "type": "array", "items": { "type": "string" } },
    "subscription_or_bundle": { "type": ["string", "null"] },
    "shipping_hook": { "type": ["string", "null"] },
    "label_tags": { "type": "array", "items": { "type": "string" } }
  }
}
```

---

## G6-Pass-2 — Product Detail Pages (Top 3)

Use the native Firecrawl `product` format — no custom prompt needed.

```json
POST https://api.firecrawl.dev/v2/scrape
{
  "url": "[PRODUCT_DETAIL_URL]",
  "formats": [
    { "type": "product" },
    { "type": "images" },
    {
      "type": "screenshot",
      "fullPage": false,
      "quality": 85,
      "viewport": { "width": 1440, "height": 900 }
    }
  ],
  "waitFor": 1500
}
```

**`product` format returns automatically:** title, brand, category, description, variants (with price, availability, images per variant), SKU, sale info.

> Run this call for the top 3 products from `product_card_urls`. Download all variant images returned.

---

## G6-Pass-3 — Ingredient / Material / Fabric Details

```json
POST https://api.firecrawl.dev/v2/scrape
{
  "url": "[PRODUCT_DETAIL_URL]",
  "formats": [
    {
      "type": "json",
      "prompt": "Extract: (1) INGREDIENTS or MATERIALS list verbatim, (2) any CERTIFICATIONS on this product (e.g. organic, cruelty-free, Oeko-Tex), (3) SIZE_GUIDE content if present, (4) CARE_INSTRUCTIONS if present. Return null for absent fields.",
      "schema": {
        "type": "object",
        "properties": {
          "ingredients_or_materials": { "type": ["string", "null"] },
          "product_certifications": { "type": "array", "items": { "type": "string" } },
          "size_guide": { "type": ["string", "null"] },
          "care_instructions": { "type": ["string", "null"] }
        }
      }
    }
  ]
}
```

---

---

# G7 — B2B SaaS & Software

**Triggered by:** Schema.org `SoftwareApplication`, `WebApplication`; vertical signals: "integrations", "dashboard", "API", "free trial", "pricing plans"  
**Key pages:** `/features`, `/pricing`, `/integrations`, `/vs`, `/customers`

---

## G7-Pass-1 — Features & Product Overview

```json
POST https://api.firecrawl.dev/v2/scrape
{
  "url": "https://[BRAND_DOMAIN]/features",
  "formats": [
    { "type": "markdown" },
    { "type": "images" },
    {
      "type": "screenshot",
      "fullPage": true,
      "quality": 85
    },
    {
      "type": "json",
      "prompt": "SEE PROMPT: G7-P1-FEATURES",
      "schema": "SEE SCHEMA: G7-S1-FEATURES"
    }
  ],
  "waitFor": 2000
}
```

### Prompt G7-P1-FEATURES

```
You are extracting feature and product positioning data from a B2B SaaS features page.

Extract:

1. FEATURE_NAMES: All named features or capabilities (array)
2. FEATURE_DESCRIPTIONS: Brief description of each feature (array of {name, description})
3. ROI_CLAIMS: Any stated ROI, time-savings, or performance improvement claims (e.g. "Save 5 hours/week", "10x faster") (array)
4. INTEGRATION_COUNT: Total number of integrations mentioned (e.g. "200+ integrations")
5. DASHBOARD_DESCRIBED: Is there a dashboard or analytics feature? Brief description if yes.
6. API_MENTIONED: Is there an API or developer access? Yes/no + brief description.
7. SECURITY_CLAIMS: Any SOC2, GDPR, HIPAA, ISO, or other compliance/security mentions (array)
8. USE_CASE_LABELS: Any specific use case or job-role targeting language (e.g. "For marketing teams", "Built for agencies") (array)
9. PRODUCT_SCREENSHOTS_ALT: Alt text of any product UI screenshots on this page (array — these are the image captions we'll use to label downloaded images)
```

### Schema G7-S1-FEATURES

```json
{
  "type": "object",
  "properties": {
    "feature_names": { "type": "array", "items": { "type": "string" } },
    "feature_descriptions": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": { "type": "string" },
          "description": { "type": "string" }
        }
      }
    },
    "roi_claims": { "type": "array", "items": { "type": "string" } },
    "integration_count": { "type": ["string", "null"] },
    "dashboard_described": { "type": ["string", "null"] },
    "api_mentioned": { "type": ["string", "null"] },
    "security_claims": { "type": "array", "items": { "type": "string" } },
    "use_case_labels": { "type": "array", "items": { "type": "string" } },
    "product_screenshots_alt": { "type": "array", "items": { "type": "string" } }
  }
}
```

---

## G7-Pass-2 — Pricing Page

```json
POST https://api.firecrawl.dev/v2/scrape
{
  "url": "https://[BRAND_DOMAIN]/pricing",
  "formats": [
    { "type": "markdown" },
    {
      "type": "screenshot",
      "fullPage": true,
      "quality": 90,
      "viewport": { "width": 1440, "height": 900 }
    },
    {
      "type": "json",
      "prompt": "Extract pricing tiers from this SaaS pricing page: (1) PLAN_NAMES: array of plan names, (2) PLAN_PRICES: array of {plan, price, billing_period}, (3) FREE_TIER: description of any free or freemium tier, (4) FREE_TRIAL: any free trial offer and duration, (5) ENTERPRISE_CTA: any 'contact sales' or enterprise language, (6) MOST_POPULAR_PLAN: which plan is labeled most popular or recommended, (7) KEY_DIFFERENTIATORS: what features distinguish each plan (array of {plan, key_feature}). Return null for absent fields.",
      "schema": {
        "type": "object",
        "properties": {
          "plan_names": { "type": "array", "items": { "type": "string" } },
          "plan_prices": { "type": "array", "items": { "type": "object" } },
          "free_tier": { "type": ["string", "null"] },
          "free_trial": { "type": ["string", "null"] },
          "enterprise_cta": { "type": ["string", "null"] },
          "most_popular_plan": { "type": ["string", "null"] },
          "key_differentiators": { "type": "array", "items": { "type": "object" } }
        }
      }
    }
  ],
  "waitFor": 1500
}
```

---

## G7-Pass-3 — Integrations & Competitor Compare

```json
POST https://api.firecrawl.dev/v2/scrape
{
  "url": "https://[BRAND_DOMAIN]/integrations",
  "formats": [
    { "type": "markdown" },
    { "type": "images" },
    {
      "type": "json",
      "prompt": "Extract: (1) INTEGRATION_NAMES: all named integrations or connected apps (array, up to 50), (2) INTEGRATION_CATEGORIES: any category groupings used (e.g. 'CRM', 'Analytics', 'Payments') (array), (3) INTEGRATION_LOGOS: alt text of integration partner logos (array — for image labeling). Return null for absent fields.",
      "schema": {
        "type": "object",
        "properties": {
          "integration_names": { "type": "array", "items": { "type": "string" } },
          "integration_categories": { "type": "array", "items": { "type": "string" } },
          "integration_logos": { "type": "array", "items": { "type": "string" } }
        }
      }
    }
  ]
}
```

**Also run on `/compare` or `/vs/[competitor]` pages if found in links:**

```json
{
  "type": "json",
  "prompt": "Extract competitor comparison data: (1) COMPETITOR_NAME: who is being compared against, (2) ADVANTAGES: what this product claims to do better (array), (3) TABLE_HEADERS: column headers from any comparison table (array), (4) SWITCHING_CTA: any 'switch from X' or migration offer language. Return null for absent fields."
}
```

---

---

# G8 — Real Estate & Property

**Triggered by:** Schema.org `RealEstateListing`, `Apartment`, `House`; vertical signals: "listings", "sqft", "BHK", "bedrooms", "RERA", "floor plan"  
**Key pages:** `/listings`, `/properties`, `/projects`, individual listing pages

---

## G8-Pass-1 — Listing Index

```json
POST https://api.firecrawl.dev/v2/scrape
{
  "url": "https://[BRAND_DOMAIN]/listings",
  "formats": [
    { "type": "markdown" },
    { "type": "images" },
    { "type": "links" },
    {
      "type": "json",
      "prompt": "SEE PROMPT: G8-P1-LISTINGS",
      "schema": "SEE SCHEMA: G8-S1-LISTINGS"
    }
  ],
  "waitFor": 2000
}
```

### Prompt G8-P1-LISTINGS

```
You are extracting real estate listing data from a property listings index page.

Extract:

1. LISTING_NAMES: Property names or project names shown on listing cards (array)
2. LISTING_URLS: URLs of individual property/listing detail pages (array, up to 10)
3. PROPERTY_TYPES: Types of properties listed (e.g. "2BHK apartment", "villa", "commercial") (array)
4. PRICE_RANGE: Overall price range shown (e.g. "₹45L – ₹2Cr" or "$500K – $2M")
5. LOCATION_NAMES: Neighborhood, locality, or city names featured (array)
6. STATUS_LABELS: Any listing status labels (e.g. "Ready to Move", "Under Construction", "New Launch") (array)
7. DEVELOPER_NAME: The name of the developer or builder if this is a developer site
8. RERA_NUMBERS: Any RERA or regulatory registration numbers visible (array)
9. FILTER_OPTIONS: Any search/filter options available (bedroom count, price range, property type) — reveals inventory breadth
```

### Schema G8-S1-LISTINGS

```json
{
  "type": "object",
  "properties": {
    "listing_names": { "type": "array", "items": { "type": "string" } },
    "listing_urls": { "type": "array", "items": { "type": "string" } },
    "property_types": { "type": "array", "items": { "type": "string" } },
    "price_range": { "type": ["string", "null"] },
    "location_names": { "type": "array", "items": { "type": "string" } },
    "status_labels": { "type": "array", "items": { "type": "string" } },
    "developer_name": { "type": ["string", "null"] },
    "rera_numbers": { "type": "array", "items": { "type": "string" } },
    "filter_options": { "type": "array", "items": { "type": "string" } }
  }
}
```

---

## G8-Pass-2 — Individual Listing Detail (Top 3)

```json
POST https://api.firecrawl.dev/v2/scrape
{
  "url": "[LISTING_DETAIL_URL]",
  "formats": [
    { "type": "markdown" },
    { "type": "images" },
    {
      "type": "screenshot",
      "fullPage": false,
      "quality": 90,
      "viewport": { "width": 1440, "height": 900 }
    },
    {
      "type": "json",
      "prompt": "Extract from this property listing: (1) PROPERTY_NAME: official name, (2) ADDRESS_OR_LOCALITY: address or neighborhood, (3) SPECS: all specs in a structured object {bedrooms, bathrooms, sqft_or_sqm, floors, parking, facing}, (4) PRICE: listed price or price range, (5) POSSESSION_DATE: handover or possession timeline, (6) AMENITIES: all amenities listed (array), (7) FLOOR_PLAN_DESCRIPTION: any floor plan or layout description, (8) NEARBY_LANDMARKS: schools, hospitals, metro, malls mentioned (array), (9) RERA_NUMBER: registration number if present, (10) VIRTUAL_TOUR_URL: any 360° or virtual tour link. Return null for absent fields.",
      "schema": {
        "type": "object",
        "properties": {
          "property_name": { "type": "string" },
          "address_or_locality": { "type": ["string", "null"] },
          "specs": { "type": "object" },
          "price": { "type": ["string", "null"] },
          "possession_date": { "type": ["string", "null"] },
          "amenities": { "type": "array", "items": { "type": "string" } },
          "floor_plan_description": { "type": ["string", "null"] },
          "nearby_landmarks": { "type": "array", "items": { "type": "string" } },
          "rera_number": { "type": ["string", "null"] },
          "virtual_tour_url": { "type": ["string", "null"] }
        }
      }
    }
  ],
  "waitFor": 2000
}
```

---

---

# G9 — Healthcare & Medical

**Triggered by:** Schema.org `MedicalBusiness`, `Hospital`, `Physician`, `Dentist`; vertical signals: "appointment", "doctor", "treatment", "clinic", "diagnosis"  
**Key pages:** `/doctors`, `/services`, `/treatments`, `/results`

---

## G9-Pass-1 — Services & Treatments

```json
POST https://api.firecrawl.dev/v2/scrape
{
  "url": "https://[BRAND_DOMAIN]/services",
  "formats": [
    { "type": "markdown" },
    { "type": "images" },
    {
      "type": "json",
      "prompt": "SEE PROMPT: G9-P1-SERVICES",
      "schema": "SEE SCHEMA: G9-S1-SERVICES"
    }
  ],
  "waitFor": 1000
}
```

### Prompt G9-P1-SERVICES

```
You are extracting medical service and treatment data from a healthcare provider's services page.

Extract:

1. TREATMENT_NAMES: All treatments, procedures, or services offered (array)
2. SPECIALIZATIONS: Medical specializations or departments (array, e.g. "Cardiology", "Dermatology")
3. TECHNOLOGY_EQUIPMENT: Any specific technology or equipment mentioned (e.g. "3T MRI", "Da Vinci Robot") (array)
4. OUTCOME_STATS: Any patient outcome statistics (e.g. "95% success rate", "500+ surgeries") (array)
5. ACCREDITATIONS: NABH, JCI, ISO, or other accreditation bodies mentioned (array)
6. INSURANCE_ACCEPTED: Insurance or payment methods mentioned (array)
7. BOOKING_CTA: Appointment booking CTA language (exact text)
8. TELECONSULT_AVAILABLE: Is telemedicine or online consultation offered? (boolean + description)
9. LANGUAGES_SPOKEN: Languages staff or doctors speak (array)
```

### Schema G9-S1-SERVICES

```json
{
  "type": "object",
  "properties": {
    "treatment_names": { "type": "array", "items": { "type": "string" } },
    "specializations": { "type": "array", "items": { "type": "string" } },
    "technology_equipment": { "type": "array", "items": { "type": "string" } },
    "outcome_stats": { "type": "array", "items": { "type": "string" } },
    "accreditations": { "type": "array", "items": { "type": "string" } },
    "insurance_accepted": { "type": "array", "items": { "type": "string" } },
    "booking_cta": { "type": ["string", "null"] },
    "teleconsult_available": { "type": ["string", "null"] },
    "languages_spoken": { "type": "array", "items": { "type": "string" } }
  }
}
```

---

## G9-Pass-2 — Doctor / Team Profiles

```json
POST https://api.firecrawl.dev/v2/scrape
{
  "url": "https://[BRAND_DOMAIN]/doctors",
  "formats": [
    { "type": "markdown" },
    { "type": "images" },
    {
      "type": "json",
      "prompt": "Extract doctor/practitioner profiles: For each doctor visible on this page extract: (1) name, (2) title_and_specialization, (3) credentials_degrees (array), (4) years_experience (if stated), (5) profile_image_url (if present in page). Return as DOCTORS array. Also extract TOTAL_DOCTOR_COUNT if stated. Return null for absent fields.",
      "schema": {
        "type": "object",
        "properties": {
          "doctors": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "name": { "type": "string" },
                "title_and_specialization": { "type": "string" },
                "credentials_degrees": { "type": "array", "items": { "type": "string" } },
                "years_experience": { "type": ["string", "null"] },
                "profile_image_url": { "type": ["string", "null"] }
              }
            }
          },
          "total_doctor_count": { "type": ["string", "null"] }
        }
      }
    }
  ],
  "waitFor": 1500
}
```

---

---

# G10 — Education & EdTech

**Triggered by:** Schema.org `EducationalOrganization`, `Course`, `OnlineBusiness`; vertical signals: "enroll", "curriculum", "batch", "placement", "certificate"  
**Key pages:** `/courses`, `/programs`, `/instructors`, `/placements`

---

## G10-Pass-1 — Course Catalog

```json
POST https://api.firecrawl.dev/v2/scrape
{
  "url": "https://[BRAND_DOMAIN]/courses",
  "formats": [
    { "type": "markdown" },
    { "type": "images" },
    { "type": "links" },
    {
      "type": "json",
      "prompt": "SEE PROMPT: G10-P1-COURSES",
      "schema": "SEE SCHEMA: G10-S1-COURSES"
    }
  ]
}
```

### Prompt G10-P1-COURSES

```
You are extracting course and program data from an educational brand's catalog page.

Extract:

1. COURSE_NAMES: All course or program names (array)
2. COURSE_URLS: URLs of individual course detail pages (array, up to 10)
3. SUBJECT_DOMAINS: Subject areas or disciplines covered (e.g. "Data Science", "UI/UX Design") (array)
4. CERTIFICATION_TYPES: Types of certificates or credentials awarded (e.g. "Industry Certificate", "Diploma", "Degree") (array)
5. FORMAT_OPTIONS: Delivery formats available (e.g. "Online", "Hybrid", "Weekend Batch", "Self-paced") (array)
6. DURATION_RANGE: Typical course duration range (e.g. "3–6 months")
7. PRICE_RANGE: Course price range or starting price
8. FREE_RESOURCE_OFFER: Any free trial, free webinar, or free resource offered
9. ENROLLMENT_URGENCY: Any batch-start date, deadline, or seat-limit language
```

### Schema G10-S1-COURSES

```json
{
  "type": "object",
  "properties": {
    "course_names": { "type": "array", "items": { "type": "string" } },
    "course_urls": { "type": "array", "items": { "type": "string" } },
    "subject_domains": { "type": "array", "items": { "type": "string" } },
    "certification_types": { "type": "array", "items": { "type": "string" } },
    "format_options": { "type": "array", "items": { "type": "string" } },
    "duration_range": { "type": ["string", "null"] },
    "price_range": { "type": ["string", "null"] },
    "free_resource_offer": { "type": ["string", "null"] },
    "enrollment_urgency": { "type": ["string", "null"] }
  }
}
```

---

## G10-Pass-2 — Outcomes & Placements Page

```json
POST https://api.firecrawl.dev/v2/scrape
{
  "url": "https://[BRAND_DOMAIN]/placements",
  "formats": [
    { "type": "markdown" },
    { "type": "images" },
    {
      "type": "json",
      "prompt": "Extract placement and student outcome data: (1) PLACEMENT_RATE: stated placement percentage, (2) AVERAGE_SALARY: average or median salary post-completion, (3) HIRING_COMPANIES: companies that hire from this program (array, up to 30), (4) SALARY_RANGE: salary range of graduates, (5) STUDENT_SUCCESS_STORIES: any named student outcomes with before/after detail (array of {name, outcome}), (6) ALUMNI_COUNT: total alumni or graduates count, (7) OUTCOME_STATS: any other measurable outcome statistics (array). Return null for absent fields.",
      "schema": {
        "type": "object",
        "properties": {
          "placement_rate": { "type": ["string", "null"] },
          "average_salary": { "type": ["string", "null"] },
          "hiring_companies": { "type": "array", "items": { "type": "string" } },
          "salary_range": { "type": ["string", "null"] },
          "student_success_stories": { "type": "array", "items": { "type": "object" } },
          "alumni_count": { "type": ["string", "null"] },
          "outcome_stats": { "type": "array", "items": { "type": "string" } }
        }
      }
    }
  ]
}
```

---

---

# G11 — Financial Services & Fintech

**Triggered by:** Schema.org `FinancialService`, `BankOrCreditUnion`, `InsuranceAgency`; vertical signals: "interest rate", "returns", "policy", "EMI", "invest", "loan", "insure"  
**Key pages:** `/products`, `/plans`, `/calculator`, `/security`

---

## G11-Pass-1 — Financial Products

```json
POST https://api.firecrawl.dev/v2/scrape
{
  "url": "https://[BRAND_DOMAIN]/products",
  "formats": [
    { "type": "markdown" },
    { "type": "images" },
    {
      "type": "screenshot",
      "fullPage": true,
      "quality": 85
    },
    {
      "type": "json",
      "prompt": "SEE PROMPT: G11-P1-PRODUCTS",
      "schema": "SEE SCHEMA: G11-S1-PRODUCTS"
    }
  ],
  "waitFor": 2000
}
```

### Prompt G11-P1-PRODUCTS

```
You are extracting financial product data from a fintech or financial services brand.

Extract:

1. PRODUCT_NAMES: All financial products or plans offered (array — e.g. "Savings Account", "Term Life Policy", "SIP")
2. KEY_RATES: Any interest rates, returns, or yield figures prominently displayed (array of {product, rate})
3. REGULATORY_BADGES: Regulatory body registrations shown (e.g. "SEBI Registered", "RBI Regulated", "SEC Licensed") (array)
4. SECURITY_FEATURES: Any security, encryption, or data protection claims (array)
5. ELIGIBILITY_REQUIREMENTS: Any stated eligibility or qualification criteria (array)
6. MIN_INVESTMENT_OR_PREMIUM: Minimum investment amount or premium if stated
7. RETURNS_CLAIM: Any stated expected returns or historical performance (with any disclaimers noted)
8. CLAIMS_SETTLEMENT_STAT: Any claims settlement ratio or payout statistic (for insurance)
9. APP_AVAILABILITY: Is there a mobile app? iOS/Android mentioned?
10. DISCLAIMER_PRESENT: Is there a risk disclaimer or regulatory disclaimer on this page? (boolean)

IMPORTANT: Note any risk disclaimers exactly as they appear — these must be included in generated video scripts.
```

### Schema G11-S1-PRODUCTS

```json
{
  "type": "object",
  "properties": {
    "product_names": { "type": "array", "items": { "type": "string" } },
    "key_rates": { "type": "array", "items": { "type": "object" } },
    "regulatory_badges": { "type": "array", "items": { "type": "string" } },
    "security_features": { "type": "array", "items": { "type": "string" } },
    "eligibility_requirements": { "type": "array", "items": { "type": "string" } },
    "min_investment_or_premium": { "type": ["string", "null"] },
    "returns_claim": { "type": ["string", "null"] },
    "claims_settlement_stat": { "type": ["string", "null"] },
    "app_availability": { "type": ["string", "null"] },
    "disclaimer_present": { "type": "boolean" },
    "disclaimer_text": { "type": ["string", "null"] }
  }
}
```

---

## G11-Pass-2 — Calculator Page Screenshot

```json
POST https://api.firecrawl.dev/v2/scrape
{
  "url": "https://[BRAND_DOMAIN]/calculator",
  "formats": [
    {
      "type": "screenshot",
      "fullPage": false,
      "quality": 90,
      "viewport": { "width": 1440, "height": 900 }
    },
    { "type": "markdown" }
  ],
  "waitFor": 2000
}
```

> Screenshot is the primary asset here — used as a "See how much you can save" video scene.

---

---

# G12 — Restaurant, F&B & Cloud Kitchen

**Triggered by:** Schema.org `FoodEstablishment`, `Restaurant`, `CafeOrCoffeeShop`; vertical signals: "menu", "order", "delivery", "dine", "cuisine", "dish"  
**Key pages:** `/menu`, `/gallery`, `/about`

---

## G12-Pass-1 — Menu Extraction

Use Firecrawl's native `menu` format — no custom schema needed.

```json
POST https://api.firecrawl.dev/v2/scrape
{
  "url": "https://[BRAND_DOMAIN]/menu",
  "formats": [
    { "type": "menu" },
    { "type": "images" },
    { "type": "markdown" }
  ],
  "waitFor": 2000,
  "proxy": "auto"
}
```

**`menu` format returns automatically:** merchant name, all sections, all items with name, description, price, images, dietary tags, calories, availability.

> Download all item images returned in `menu.sections[].items[].images[].url`. These are the primary food photography assets.

---

## G12-Pass-2 — Gallery & Ambiance

```json
POST https://api.firecrawl.dev/v2/scrape
{
  "url": "https://[BRAND_DOMAIN]/gallery",
  "formats": [
    { "type": "images" },
    {
      "type": "screenshot",
      "fullPage": true,
      "quality": 85
    },
    {
      "type": "json",
      "prompt": "From this restaurant gallery page, identify and categorize the images: (1) FOOD_PHOTOGRAPHY_URLS: image URLs showing food or drinks, (2) INTERIOR_URLS: image URLs showing restaurant interior or ambiance, (3) EXTERIOR_URLS: image URLs showing outside of restaurant, (4) CHEF_TEAM_URLS: image URLs showing staff or kitchen, (5) EVENT_URLS: image URLs of events or gatherings. Categorize by alt text and visible context. Return arrays of URLs per category.",
      "schema": {
        "type": "object",
        "properties": {
          "food_photography_urls": { "type": "array", "items": { "type": "string" } },
          "interior_urls": { "type": "array", "items": { "type": "string" } },
          "exterior_urls": { "type": "array", "items": { "type": "string" } },
          "chef_team_urls": { "type": "array", "items": { "type": "string" } },
          "event_urls": { "type": "array", "items": { "type": "string" } }
        }
      }
    }
  ],
  "waitFor": 1500
}
```

---

## G12-Pass-3 — Delivery & Ordering Context

```json
POST https://api.firecrawl.dev/v2/scrape
{
  "url": "https://[BRAND_DOMAIN]/",
  "formats": [
    {
      "type": "json",
      "prompt": "Extract delivery and ordering information from this restaurant site: (1) DELIVERY_PLATFORMS: names of delivery apps linked (e.g. Swiggy, Zomato, DoorDash, UberEats) with their URLs (array of {platform, url}), (2) OPERATING_HOURS: opening and closing times by day, (3) RESERVATION_CTA: reservation or table booking CTA language, (4) SIGNATURE_DISHES: any 'signature', 'bestseller', or 'must-try' dishes named, (5) CUISINE_TYPES: types of cuisine served (array), (6) CATERING_AVAILABLE: any catering or private event service offered. Return null for absent fields.",
      "schema": {
        "type": "object",
        "properties": {
          "delivery_platforms": { "type": "array", "items": { "type": "object" } },
          "operating_hours": { "type": ["string", "null"] },
          "reservation_cta": { "type": ["string", "null"] },
          "signature_dishes": { "type": "array", "items": { "type": "string" } },
          "cuisine_types": { "type": "array", "items": { "type": "string" } },
          "catering_available": { "type": ["string", "null"] }
        }
      }
    }
  ]
}
```

---

---

# G13 — Fitness, Gym & Wellness

**Triggered by:** Schema.org `SportsActivityLocation`, `HealthClub`, `Spa`; vertical signals: "classes", "trainer", "workout", "membership", "transformation", "wellness"  
**Key pages:** `/classes`, `/trainers`, `/membership`, `/transformations`

---

## G13-Pass-1 — Classes & Programs

```json
POST https://api.firecrawl.dev/v2/scrape
{
  "url": "https://[BRAND_DOMAIN]/classes",
  "formats": [
    { "type": "markdown" },
    { "type": "images" },
    {
      "type": "screenshot",
      "fullPage": true,
      "quality": 85
    },
    {
      "type": "json",
      "prompt": "Extract fitness class and program data: (1) CLASS_NAMES: all class or program names (array), (2) CLASS_DESCRIPTIONS: brief description per class (array of {name, description}), (3) CLASS_SCHEDULE_PREVIEW: any sample schedule or timing information, (4) DIFFICULTY_LEVELS: any level labels used (e.g. 'Beginner', 'Advanced', 'All levels') (array), (5) FORMAT_TYPES: in-person vs online vs app-based options (array), (6) TRIAL_OFFER: any free trial, intro offer, or first-class-free offer. Return null for absent fields.",
      "schema": {
        "type": "object",
        "properties": {
          "class_names": { "type": "array", "items": { "type": "string" } },
          "class_descriptions": { "type": "array", "items": { "type": "object" } },
          "class_schedule_preview": { "type": ["string", "null"] },
          "difficulty_levels": { "type": "array", "items": { "type": "string" } },
          "format_types": { "type": "array", "items": { "type": "string" } },
          "trial_offer": { "type": ["string", "null"] }
        }
      }
    }
  ]
}
```

---

## G13-Pass-2 — Transformations & Results

```json
POST https://api.firecrawl.dev/v2/scrape
{
  "url": "https://[BRAND_DOMAIN]/transformations",
  "formats": [
    { "type": "markdown" },
    { "type": "images" },
    {
      "type": "json",
      "prompt": "Extract fitness transformation and result data: (1) TRANSFORMATION_STORIES: array of individual stories with {client_name, outcome_description, duration, metric (e.g. 'lost 15kg')}. (2) AGGREGATE_RESULTS: any summary stats (e.g. 'Average 8kg loss in 12 weeks') (array). (3) BEFORE_AFTER_IMAGE_PAIRS: describe any before/after image pairs visible by their context (array of descriptions). (4) TRAINER_NAMES_IN_STORIES: any trainers credited in success stories (array). Extract up to 10 stories. Return null for absent fields.",
      "schema": {
        "type": "object",
        "properties": {
          "transformation_stories": { "type": "array", "items": { "type": "object" } },
          "aggregate_results": { "type": "array", "items": { "type": "string" } },
          "before_after_image_pairs": { "type": "array", "items": { "type": "string" } },
          "trainer_names_in_stories": { "type": "array", "items": { "type": "string" } }
        }
      }
    }
  ],
  "waitFor": 1500
}
```

---

---

# G14 — Automotive & Dealerships

**Triggered by:** Schema.org `AutoDealer`, `CarDealer`, `MotorizedVehicle`; vertical signals: "test drive", "inventory", "mpg", "range", "horsepower", "dealership", "trade-in"  
**Key pages:** `/inventory`, `/vehicles`, `/finance`

---

## G14-Pass-1 — Vehicle Inventory

```json
POST https://api.firecrawl.dev/v2/scrape
{
  "url": "https://[BRAND_DOMAIN]/inventory",
  "formats": [
    { "type": "markdown" },
    { "type": "images" },
    { "type": "links" },
    {
      "type": "json",
      "prompt": "Extract vehicle inventory data: (1) VEHICLE_NAMES: all vehicle models/names visible (array), (2) VEHICLE_URLS: URLs of individual vehicle detail pages (array, up to 10), (3) PRICE_RANGE: overall price range shown, (4) VEHICLE_TYPES: types of vehicles (e.g. 'SUV', 'Sedan', 'EV', 'Motorcycle') (array), (5) FUEL_TYPES: fuel or power types available (e.g. 'Electric', 'Petrol', 'Diesel', 'Hybrid') (array), (6) YEAR_RANGE: model years available, (7) FINANCE_HOOK: any EMI, financing, or payment plan language visible, (8) TRADE_IN_OFFER: any trade-in or exchange offer language. Return null for absent fields.",
      "schema": {
        "type": "object",
        "properties": {
          "vehicle_names": { "type": "array", "items": { "type": "string" } },
          "vehicle_urls": { "type": "array", "items": { "type": "string" } },
          "price_range": { "type": ["string", "null"] },
          "vehicle_types": { "type": "array", "items": { "type": "string" } },
          "fuel_types": { "type": "array", "items": { "type": "string" } },
          "year_range": { "type": ["string", "null"] },
          "finance_hook": { "type": ["string", "null"] },
          "trade_in_offer": { "type": ["string", "null"] }
        }
      }
    }
  ],
  "waitFor": 2000
}
```

---

## G14-Pass-2 — Vehicle Detail Pages (Top 3)

```json
POST https://api.firecrawl.dev/v2/scrape
{
  "url": "[VEHICLE_DETAIL_URL]",
  "formats": [
    { "type": "markdown" },
    { "type": "images" },
    {
      "type": "screenshot",
      "fullPage": false,
      "quality": 90,
      "viewport": { "width": 1440, "height": 900 }
    },
    {
      "type": "json",
      "prompt": "Extract vehicle detail data: (1) VEHICLE_NAME: full model name, (2) SPECS: structured specs object {engine, horsepower, torque, fuel_economy_or_range, seating_capacity, cargo_space, transmission, drivetrain}, (3) PRICE: listed price or starting price, (4) COLOR_OPTIONS: available colors (array), (5) SAFETY_RATINGS: any NCAP, NHTSA, or safety award ratings (array), (6) KEY_FEATURES: top 5-7 features highlighted on this page (array), (7) IMAGE_ANGLES_AVAILABLE: which photo angles are shown (e.g. 'exterior front', 'interior dashboard', '3/4 rear') (array), (8) TEST_DRIVE_CTA: CTA text for scheduling a test drive. Return null for absent fields.",
      "schema": {
        "type": "object",
        "properties": {
          "vehicle_name": { "type": "string" },
          "specs": { "type": "object" },
          "price": { "type": ["string", "null"] },
          "color_options": { "type": "array", "items": { "type": "string" } },
          "safety_ratings": { "type": "array", "items": { "type": "string" } },
          "key_features": { "type": "array", "items": { "type": "string" } },
          "image_angles_available": { "type": "array", "items": { "type": "string" } },
          "test_drive_cta": { "type": ["string", "null"] }
        }
      }
    }
  ],
  "waitFor": 2000
}
```

---

---

# G15 — Legal & Professional Services

**Triggered by:** Schema.org `LegalService`, `Attorney`, `AccountingService`; vertical signals: "consultation", "practice area", "attorney", "counsel", "firm", "brief"  
**Key pages:** `/practice-areas`, `/team`, `/results`

---

## G15-Pass-1 — Practice Areas & Services

```json
POST https://api.firecrawl.dev/v2/scrape
{
  "url": "https://[BRAND_DOMAIN]/practice-areas",
  "formats": [
    { "type": "markdown" },
    { "type": "links" },
    {
      "type": "json",
      "prompt": "Extract legal or professional service data: (1) PRACTICE_AREA_NAMES: all practice areas or service categories (array), (2) PRACTICE_AREA_URLS: URLs of individual practice area pages (array), (3) JURISDICTION: geographic areas or courts covered (array), (4) CASE_TYPES: specific case types handled within practice areas (array), (5) BAR_ASSOCIATIONS: any bar association or professional body memberships listed (array), (6) LANGUAGES_SERVED: languages the firm serves clients in (array), (7) CONSULTATION_CTA: free consultation or intake CTA language. Return null for absent fields.",
      "schema": {
        "type": "object",
        "properties": {
          "practice_area_names": { "type": "array", "items": { "type": "string" } },
          "practice_area_urls": { "type": "array", "items": { "type": "string" } },
          "jurisdiction": { "type": "array", "items": { "type": "string" } },
          "case_types": { "type": "array", "items": { "type": "string" } },
          "bar_associations": { "type": "array", "items": { "type": "string" } },
          "languages_served": { "type": "array", "items": { "type": "string" } },
          "consultation_cta": { "type": ["string", "null"] }
        }
      }
    }
  ]
}
```

---

## G15-Pass-2 — Attorney / Team Profiles

```json
POST https://api.firecrawl.dev/v2/scrape
{
  "url": "https://[BRAND_DOMAIN]/team",
  "formats": [
    { "type": "markdown" },
    { "type": "images" },
    {
      "type": "json",
      "prompt": "Extract professional profiles: For each attorney, partner, or consultant visible extract: {name, title, specialization_areas (array), credentials_and_bar_admissions (array), years_experience, notable_cases_or_achievements (array), profile_image_url}. Return as PROFESSIONALS array. Also extract FIRM_SIZE if stated (number of attorneys or staff). Return null for absent fields.",
      "schema": {
        "type": "object",
        "properties": {
          "professionals": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "name": { "type": "string" },
                "title": { "type": ["string", "null"] },
                "specialization_areas": { "type": "array", "items": { "type": "string" } },
                "credentials_and_bar_admissions": { "type": "array", "items": { "type": "string" } },
                "years_experience": { "type": ["string", "null"] },
                "notable_cases_or_achievements": { "type": "array", "items": { "type": "string" } },
                "profile_image_url": { "type": ["string", "null"] }
              }
            }
          },
          "firm_size": { "type": ["string", "null"] }
        }
      }
    }
  ],
  "waitFor": 1500
}
```

---

---

# G16 — Travel & Hospitality

**Triggered by:** Schema.org `LodgingBusiness`, `Hotel`, `TouristAttraction`; vertical signals: "room", "check-in", "itinerary", "resort", "accommodation", "amenities"  
**Key pages:** `/rooms`, `/amenities`, `/experiences`, `/dining`

---

## G16-Pass-1 — Rooms & Accommodations

```json
POST https://api.firecrawl.dev/v2/scrape
{
  "url": "https://[BRAND_DOMAIN]/rooms",
  "formats": [
    { "type": "markdown" },
    { "type": "images" },
    { "type": "links" },
    {
      "type": "json",
      "prompt": "SEE PROMPT: G16-P1-ROOMS",
      "schema": "SEE SCHEMA: G16-S1-ROOMS"
    }
  ],
  "waitFor": 2000
}
```

### Prompt G16-P1-ROOMS

```
You are extracting accommodation data from a hotel, resort, or hospitality brand.

Extract:

1. ROOM_TYPES: All room or suite types (array)
2. ROOM_URLS: URLs of individual room detail pages (array, up to 8)
3. PRICE_RANGE: Nightly rate range or "from" price
4. MAX_OCCUPANCY: Maximum guests per room/suite
5. AMENITY_HIGHLIGHTS: Top amenities listed on this page (array — pool, spa, gym, beach, etc.)
6. VIEW_TYPES: Types of views available (e.g. "ocean view", "garden view", "city view") (array)
7. BOOKING_CTA: CTA text for booking/reserving a room
8. URGENCY_LANGUAGE: Any "limited availability", "only X rooms left", or seasonal urgency language
9. SUSTAINABILITY_CLAIMS: Any eco-friendly, green, or sustainability certifications
```

### Schema G16-S1-ROOMS

```json
{
  "type": "object",
  "properties": {
    "room_types": { "type": "array", "items": { "type": "string" } },
    "room_urls": { "type": "array", "items": { "type": "string" } },
    "price_range": { "type": ["string", "null"] },
    "max_occupancy": { "type": ["string", "null"] },
    "amenity_highlights": { "type": "array", "items": { "type": "string" } },
    "view_types": { "type": "array", "items": { "type": "string" } },
    "booking_cta": { "type": ["string", "null"] },
    "urgency_language": { "type": ["string", "null"] },
    "sustainability_claims": { "type": ["string", "null"] }
  }
}
```

---

## G16-Pass-2 — Room Detail Pages (Top 3) + Gallery

```json
POST https://api.firecrawl.dev/v2/scrape
{
  "url": "[ROOM_DETAIL_URL]",
  "formats": [
    { "type": "markdown" },
    { "type": "images" },
    {
      "type": "screenshot",
      "fullPage": false,
      "quality": 90,
      "viewport": { "width": 1440, "height": 900 }
    },
    {
      "type": "json",
      "prompt": "Extract room detail data: (1) ROOM_NAME: official room name, (2) ROOM_DESCRIPTION: full marketing description, (3) ROOM_SPECS: {size_sqm_or_sqft, max_guests, bed_type, floor_level}, (4) IN_ROOM_AMENITIES: all in-room features (array), (5) PRICE_PER_NIGHT: if stated, (6) VIRTUAL_TOUR_URL: any 360 tour link. Return null for absent fields.",
      "schema": {
        "type": "object",
        "properties": {
          "room_name": { "type": "string" },
          "room_description": { "type": ["string", "null"] },
          "room_specs": { "type": "object" },
          "in_room_amenities": { "type": "array", "items": { "type": "string" } },
          "price_per_night": { "type": ["string", "null"] },
          "virtual_tour_url": { "type": ["string", "null"] }
        }
      }
    }
  ],
  "waitFor": 2000
}
```

**Also run on `/gallery` if it exists:**

```json
{
  "url": "https://[BRAND_DOMAIN]/gallery",
  "formats": [{ "type": "images" }],
  "waitFor": 1500
}
```

> Download all gallery images and tag by inferred category: `room | exterior | pool | dining | spa | destination`.

---

---

# G17 — Home Services & Interior Design

**Triggered by:** Schema.org `HomeAndConstructionBusiness`, `GeneralContractor`, `InteriorDesigner`; vertical signals: "renovation", "installation", "service area", "free estimate", "contractor", "interior"  
**Key pages:** `/services`, `/portfolio`, `/process`

---

## G17-Pass-1 — Services & Portfolio

```json
POST https://api.firecrawl.dev/v2/scrape
{
  "url": "https://[BRAND_DOMAIN]/services",
  "formats": [
    { "type": "markdown" },
    { "type": "images" },
    { "type": "links" },
    {
      "type": "json",
      "prompt": "SEE PROMPT: G17-P1-SERVICES",
      "schema": "SEE SCHEMA: G17-S1-SERVICES"
    }
  ]
}
```

### Prompt G17-P1-SERVICES

```
You are extracting service and portfolio data from a home services, renovation, or interior design brand.

Extract:

1. SERVICE_NAMES: All services offered (array — e.g. "Kitchen Remodel", "Electrical Installation", "Interior Styling")
2. SERVICE_AREAS: Geographic areas, cities, or zip codes served (array)
3. LICENSE_AND_INSURANCE: Any license numbers, insurance, or bonding mentions (array)
4. BRAND_PARTNERSHIPS: Named material or product brands used (e.g. "Kohler", "Asian Paints", "IKEA") (array)
5. PORTFOLIO_URLS: URLs of individual project or portfolio pages (array, up to 10)
6. PROCESS_STEPS: If a "how it works" or process is described, extract steps (array of {step_number, title, description})
7. WARRANTY_TERMS: Any warranty or workmanship guarantee
8. ESTIMATE_CTA: Free estimate or quote CTA language
9. TYPICAL_TIMELINE: Any stated project duration or timeline info
```

### Schema G17-S1-SERVICES

```json
{
  "type": "object",
  "properties": {
    "service_names": { "type": "array", "items": { "type": "string" } },
    "service_areas": { "type": "array", "items": { "type": "string" } },
    "license_and_insurance": { "type": "array", "items": { "type": "string" } },
    "brand_partnerships": { "type": "array", "items": { "type": "string" } },
    "portfolio_urls": { "type": "array", "items": { "type": "string" } },
    "process_steps": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "step_number": { "type": "integer" },
          "title": { "type": "string" },
          "description": { "type": "string" }
        }
      }
    },
    "warranty_terms": { "type": ["string", "null"] },
    "estimate_cta": { "type": ["string", "null"] },
    "typical_timeline": { "type": ["string", "null"] }
  }
}
```

---

## G17-Pass-2 — Portfolio / Project Gallery

```json
POST https://api.firecrawl.dev/v2/scrape
{
  "url": "https://[BRAND_DOMAIN]/portfolio",
  "formats": [
    { "type": "images" },
    {
      "type": "screenshot",
      "fullPage": true,
      "quality": 85
    },
    {
      "type": "json",
      "prompt": "From this home services or interior design portfolio page, extract: (1) PROJECT_NAMES: names or titles of featured projects (array), (2) PROJECT_TYPES: type of work shown per project (e.g. 'Kitchen Renovation', 'Full Home Interior', 'Bathroom Remodel') (array), (3) BEFORE_AFTER_PAIRS: any before/after image groupings described by alt text or caption (array of descriptions), (4) CLIENT_TESTIMONIALS_ON_PORTFOLIO: any client quotes embedded in portfolio items (array of {quote, project_type}), (5) MATERIALS_FEATURED: any material or product brand names visible in project descriptions (array). Return null for absent fields.",
      "schema": {
        "type": "object",
        "properties": {
          "project_names": { "type": "array", "items": { "type": "string" } },
          "project_types": { "type": "array", "items": { "type": "string" } },
          "before_after_pairs": { "type": "array", "items": { "type": "string" } },
          "client_testimonials_on_portfolio": { "type": "array", "items": { "type": "object" } },
          "materials_featured": { "type": "array", "items": { "type": "string" } }
        }
      }
    }
  ],
  "waitFor": 2000
}
```

---

## Vertical Credit Budget Summary

| Vertical | Additional Pages | JSON Calls | Est. Extra Credits |
|---|---|---|---|
| G6 — D2C / E-Commerce | 4–6 | 4 | ~30 |
| G7 — B2B SaaS | 3–4 | 3 | ~22 |
| G8 — Real Estate | 4–5 | 4 | ~28 |
| G9 — Healthcare | 2–3 | 2 | ~18 |
| G10 — Education | 3–4 | 3 | ~22 |
| G11 — Financial Services | 2–3 | 2 | ~18 |
| G12 — Restaurant / F&B | 3 | 2 | ~15 |
| G13 — Fitness / Wellness | 2–3 | 2 | ~18 |
| G14 — Automotive | 4–5 | 4 | ~28 |
| G15 — Legal / Professional | 2 | 2 | ~14 |
| G16 — Travel / Hospitality | 4–5 | 4 | ~28 |
| G17 — Home Services | 2–3 | 2 | ~18 |

> **Total per brand (Universal + Vertical):** ~50–65 credits depending on vertical depth.
> D2C and Automotive are the heaviest due to per-product/per-vehicle detail page crawls.

---

## Output: vertical_assets Append Block

After the vertical crawl completes, append this block to `brand_universal.json`:

```json
{
  "vertical_assets": {
    "detected_vertical": "[G6|G7|G8|G9|G10|G11|G12|G13|G14|G15|G16|G17]",
    "vertical_label": "[D2C|SaaS|RealEstate|Healthcare|Education|Fintech|Restaurant|Fitness|Auto|Legal|Hospitality|HomeServices]",
    "products_or_services": [],
    "visual_assets": {
      "product_images": [],
      "lifestyle_images": [],
      "facility_images": [],
      "team_images": [],
      "before_after_pairs": [],
      "screenshots": []
    },
    "copy_assets": {
      "service_descriptions": [],
      "outcome_stats": [],
      "pricing_summary": null,
      "cta_language": null,
      "urgency_language": null,
      "compliance_disclaimers": []
    },
    "raw_vertical_data": {}
  }
}
```
