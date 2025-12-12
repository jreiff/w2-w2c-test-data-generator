# W2/W2C Test Data Generator

A Node.js application that generates synthetic W2 and W2C (corrected W2) test data matching the Workday report format. The application generates realistic employee data with multiple companies, states, localities, and W2C corrections.

## Features

- Generate synthetic W2 and W2C test data
- Support for multiple companies, states, and localities
- Realistic employee data with proper tax calculations
- W2C correction generation with proper matching logic
- Validation tool for verifying data correctness
- REST API for programmatic access
- Generate by employee count or target file size
- Multi-tier caching (memory + file-based)

## Installation

1. Clone or download this repository

2. Install dependencies:

```bash
npm install
```

## Project Structure

```
generate-w2-w2c-test-data/
├── package.json              # Project dependencies and scripts
├── generator.js              # Core data generation logic
├── generate.js               # CLI entry point for data generation
├── validate.js               # Validation tool for W2C corrections
├── server.js                 # Express API server with caching
├── render.yaml               # Render.com deployment configuration
├── w2report.json             # Sample W2 report format reference
├── w2creport.json            # Sample W2C report format reference
├── data/                     # Generated data files directory
│   ├── employees_*.json      # Generated employee data files
│   └── cache_*.json          # Cache files
└── README.md                 # This file
```

## Usage

### Generate Data

**By employee count:**

```bash
npm run generate 100 2024
# or
node generate.js 100 2024
```

**By file size:**

```bash
npm run generate 0.5MB 2024
npm run generate 10MB 2024
```

Files are saved as: `data/employees_<count>_<year>.json` or `data/employees_<size>MB_<year>.json`

### Start API Server

```bash
npm start
# or
npm run dev  # with auto-reload
```

Server runs on `http://localhost:3000`

**API Endpoints:**

- `GET /health` - Health check
- `POST /api/generate` - Generate test data (body: `{numEmployees, calendarYear, forceRegenerate?}`)
- `GET /api/files` - List generated files
- `GET /api/files/:filename` - Get a specific file
- `GET /api/stats` - Get statistics about generated data and cache
- `DELETE /api/cache` - Clear cache (query: `?type=all|memory|file`)

### Validate Corrections

```bash
npm run validate data/employees_100_2024.json data/orchestration_output.json
# or
node validate.js data/employees_100_2024.json data/orchestration_output.json
```

The validator:
- Extracts W2s from multiple formats (array of arrays, Report_Entry, employees structure)
- Matches W2s by Employee_ID, Company, State, Calendar_Year
- Matches W2Cs to W2s by Company, State, Locality (Workday matching logic)
- Validates that corrections were applied correctly
- Reports incomplete entries and numeric fields that should be strings

## Data Generation Rules

1. **6 companies** under a single parent company
2. **10% of employees** work for more than one company
3. **1-2 states** per company (random)
4. **0-3 localities** per state (random, only for states with local taxes)
5. **0-2 W2Cs** per W2 (random, ~30% of employees have W2Cs)
6. All W2s and W2Cs in a single file have the same calendar year

## W2C Correction Fields

W2Cs can correct:
- State wages (`XMLNAME_16_-_State_Wages_tips__etc_group`)
- Local wages (`XMLNAME_18_-_Local_wages__tips__etc_1/2`)
- Social Security Number (`Social_Security_Number-Truncated_51698499`)
- State ID numbers (`XMLNAME_15_-_State_-_Employer_s_State_ID_Number`)

## Important Notes

1. **All numeric values are strings** - This is critical for Workday orchestration compatibility. The generator converts all numbers to strings using:
   - `roundCurrencyToString(value)` for currency fields (2 decimal places)
   - `intToString(value)` for integer fields

2. **W2C matching doesn't use Employee_ID** - Uses Company, State, Locality instead (Workday matching logic)

3. **Field name format** - Both W2 and W2C use `etc_group` (without period) for state wages and `etc_1`/`etc_2` (without period) for local wages

4. **Incomplete entries** - Some orchestration outputs may have incomplete W2 entries missing Employee_ID

5. **Output formats** - The validator supports:
   - Array of arrays (preferred): `[[{W2 object}], [{W2 object}], ...]`
   - Report_Entry array: `{Report_Entry: [w2, ...]}`
   - Employees structure: `{employees: [{w2s: {Report_Entry: [w2]}}]}`

## Caching

The API includes a multi-tier caching system:
- **Memory cache**: Fast in-memory cache (LRU, max 10 entries)
- **File cache**: Persistent disk cache (survives restarts)
- **Cache TTL**: 24 hours by default (configurable via `CACHE_TTL` env var)
- **Cache management**: Use `DELETE /api/cache` to clear cache

## Deployment

### Render.com

1. Push code to GitHub
2. Go to render.com and create new Web Service
3. Connect your GitHub repository
4. Render will auto-detect Node.js and use `render.yaml` if present
5. Deploy!

The `render.yaml` file is already configured for deployment.

## States with Local Taxes

The following states support local taxes:
- PA (Pennsylvania)
- OH (Ohio)
- KY (Kentucky)
- IN (Indiana)
- MI (Michigan)
- MD (Maryland)
- NY (New York)
- AL (Alabama)

## Box 12 Codes

Supported Box 12 codes:
- D: Deferred compensation
- W: Employer contributions to HSA
- DD: Cost of employer-sponsored health coverage
- E: Employer contributions to 401(k)
- G: Employer contributions to 403(b)
- H: Employer contributions to 457(b)

## License

ISC

