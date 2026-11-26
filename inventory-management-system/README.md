# Inventory and Data Management System

Web Development III – Assignment 3 (Unit 3, CO3)

A full-stack inventory app: a RESTful **Node.js + Express + MongoDB (Mongoose)** backend with a **vanilla HTML/CSS/JS** dashboard (StockPilot). The Express server also serves the frontend, so one command runs everything.

## Tech stack

- Backend: Node.js, Express.js, MongoDB, Mongoose, dotenv
- Frontend: HTML, CSS, vanilla JavaScript (no frameworks)

## Project structure

```
inventory-management-system/
├── backend/
│   ├── config/db.js                  # MongoDB connection
│   ├── controllers/productController.js
│   ├── middleware/
│   │   ├── errorMiddleware.js        # 404 + centralized error handler
│   │   └── validateProduct.js        # request-body validation
│   ├── models/Product.js             # schema, validation, stockValue virtual
│   ├── routes/productRoutes.js
│   ├── .env / .env.example
│   ├── seed.js                       # optional sample data
│   ├── server.js
│   └── package.json
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── script.js
└── README.md
```

## Setup

1. Install and start MongoDB (local) – or use a MongoDB Atlas URI.
2. Install dependencies and configure the environment:

   ```bash
   cd backend
   npm install
   cp .env.example .env      # edit MONGO_URI if needed (a default .env is included)
   ```

3. (Optional) load sample data:

   ```bash
   npm run seed
   ```

4. Start the server:

   ```bash
   npm start          # or: npm run dev  (auto-restart)
   ```

5. Open **http://localhost:5000** for the dashboard. API base: `http://localhost:5000/api/products`.

`.env` values:

| Variable    | Default                                     |
|-------------|---------------------------------------------|
| `PORT`      | `5000`                                      |
| `MONGO_URI` | `mongodb://127.0.0.1:27017/inventory_db`    |

## Product schema

| Field          | Rules                                          |
|----------------|------------------------------------------------|
| `name`         | String, required, 2–120 chars                  |
| `sku`          | String, required, **unique**, stored uppercase |
| `category`     | String, required                               |
| `price`        | Number, required, min 0                        |
| `quantity`     | Integer, required, min 0                       |
| `reorderLevel` | Integer, required, min 0                       |
| `supplier`     | String, required                               |
| `createdAt`, `updatedAt` | Added automatically (timestamps)     |

Virtual: `stockValue = price * quantity` (included in every JSON response).

Duplicate SKUs are blocked by a unique index; the error middleware converts the Mongo `11000` error into a **409** response with a clear message.

## API reference

| Method | Endpoint                      | Description |
|--------|-------------------------------|-------------|
| POST   | `/api/products`               | Create product → `201` + product |
| GET    | `/api/products`               | List with filter / search / sort / pagination |
| GET    | `/api/products/:id`           | Get one product |
| PUT    | `/api/products/:id`           | Update product (partial bodies allowed) |
| DELETE | `/api/products/:id`           | Delete → `{ message, id }` |
| GET    | `/api/products/low-stock`     | Products with `quantity <= reorderLevel` → `{ count, lowStockItems }` |
| GET    | `/api/products/summary`       | Category summary via aggregation → `{ categories, summary }` |
| PATCH  | `/api/products/:id/stock`     | Body `{ "change": 10 }` (negative to remove); never goes below 0 |

### GET `/api/products` query parameters

| Param      | Example               | Notes |
|------------|-----------------------|-------|
| `category` | `Electronics`         | case-insensitive exact match |
| `minPrice` / `maxPrice` | `500` / `5000` | inclusive range |
| `search`   | `mouse` or `ELEC-`    | matches name or SKU (case-insensitive) |
| `sortBy`   | `price`, `name`, `quantity` (default `createdAt`) | |
| `order`    | `asc` / `desc`        | |
| `page`, `limit` | `2`, `10`        | limit capped at 100 |

Response: `{ total, page, totalPages, count, products }`.

Example: `GET /api/products?category=Electronics&minPrice=500&sortBy=price&order=desc&page=1&limit=5`

### Sample requests

```bash
# Create
curl -X POST http://localhost:5000/api/products -H "Content-Type: application/json" \
  -d '{"name":"Gel Pen Pack of 15","sku":"STNY-PN-713","category":"Stationery","price":120,"quantity":40,"reorderLevel":20,"supplier":"Cello Pens"}'

# Update
curl -X PUT http://localhost:5000/api/products/<id> -H "Content-Type: application/json" \
  -d '{"price":140,"quantity":60}'

# Stock adjustment (restock +10 / sale -3)
curl -X PATCH http://localhost:5000/api/products/<id>/stock -H "Content-Type: application/json" -d '{"change":10}'
```

### Error format

```json
{ "success": false, "message": "Validation failed", "errors": ["Price cannot be negative"] }
```

| Status | When |
|--------|------|
| 400 | Validation failure, invalid ID, bad query param, insufficient stock |
| 404 | Product / route not found |
| 409 | Duplicate SKU |
| 500 | Unexpected server error |

## Implementation notes

- **Route order:** `/low-stock` and `/summary` are registered before `/:id` so they aren't mistaken for IDs.
- **Safe stock adjustment:** `PATCH /:id/stock` uses a single atomic `findOneAndUpdate` with `$inc` and a `quantity >= -change` guard, so concurrent sales can't push stock negative.
- **Aggregation:** the summary uses `$group` (count, sum of quantity, sum of `price × quantity`, average price) followed by `$project` / `$sort`.
- **Validation in two layers:** `validateProduct` middleware, then Mongoose schema validators (also on updates via `runValidators`).
- **Mass-assignment protection:** only whitelisted fields are accepted from the request body.

## Dashboard features

- Dashboard: total products, total stock, inventory value, low-stock count, value-by-category chart, restock list
- All Products: search (name/SKU), category filter, price range, sorting, pagination, edit modal, delete confirmation, stock adjustment modal
- Add Product: client-side validation + server error display (e.g. duplicate SKU)
- Low Stock: warning banner and restock actions
- Inventory Reports: category summary table + CSS bar charts
- Responsive layout (collapsible sidebar on mobile)
