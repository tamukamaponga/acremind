/**
 * REGISTER DEFINITIONS — edit this file to change form fields, then run npm run catalog.
 * It generates src/catalog.json, which is read by PHP and sent to the browser.
 * f = general field, n = number, d = date, sel = choice, ref = linked record.
 * A field's key is stored in the database; its label is shown to the user.
 * Keep existing keys stable so saved records still match their definitions.
 */
const fs = require('fs');
const modules = {};
const f = (key, label, type = 'text', required = true, extra = {}) => ({
  key,
  label,
  type,
  required,
  ...extra,
});
const n = (key, label, required = true, min = 0) =>
  f(key, label, 'number', required, { min, step: '0.01' });
const d = (key, label, required = true) => f(key, label, 'date', required);
const sel = (key, label, options, required = true) =>
  f(key, label, 'select', required, { options: options.split('|') });
const ref = (key, label, target, required = true) =>
  f(key, label, 'reference', required, { ref: target });
const notes = f('notes', 'Notes', 'textarea', false);
const farm = () => ref('farm', 'Farm', 'farms');
const add = (id, label, group, fields, description) =>
  (modules[id] = { id, label, group, fields, description });
// Land and crop production
add(
  'farms',
  'Farms',
  'Land & crops',
  [
    f('name', 'Farm name'),
    f('location', 'Location'),
    n('hectares', 'Area (ha)', true, 0.01),
    n('latitude', 'Latitude', false, -90),
    n('longitude', 'Longitude', false, -180),
    f('boundary', 'Boundary coordinates (GeoJSON)', 'textarea', false),
    notes,
  ],
  'Register farms, locations and land boundaries.',
);
add(
  'fields',
  'Fields',
  'Land & crops',
  [
    f('name', 'Field name'),
    farm(),
    n('hectares', 'Area (ha)', true, 0.01),
    sel('soil', 'Soil type', 'Loam|Clay|Sandy|Silt|Peat|Chalk|Other'),
    n('ph', 'Soil pH', false),
    f('soil_condition', 'Soil condition', 'textarea', false),
    f('land_use', 'Land use plan', 'textarea', false),
    notes,
  ],
  'Manage field size, soil condition and land use.',
);
add(
  'crops',
  'Crop varieties',
  'Land & crops',
  [
    f('name', 'Crop name'),
    f('variety', 'Variety'),
    n('maturity_days', 'Days to maturity', true, 1),
    n('target_yield', 'Target yield (kg/ha)', false),
    notes,
  ],
  'Maintain the crop and variety register.',
);
add(
  'plantings',
  'Plantings',
  'Land & crops',
  [
    f('name', 'Planting name'),
    farm(),
    ref('field', 'Field', 'fields'),
    ref('crop', 'Crop variety', 'crops'),
    d('planted_on', 'Planting date'),
    d('harvest_on', 'Expected harvest'),
    n('hectares', 'Planted area (ha)', true, 0.01),
    n('spacing', 'Row spacing (cm)', false),
    n('density', 'Plants per hectare', false),
    n('seed_quantity', 'Seed quantity (kg)', false),
    n('expected_yield', 'Expected yield (kg)', false),
    sel('stage', 'Growth stage', 'Planned|Planted|Growing|Flowering|Ready|Harvested|Failed'),
    notes,
  ],
  'Plan planting, monitor crop stages and preserve field rotation history.',
);
add(
  'applications',
  'Crop applications',
  'Land & crops',
  [
    f('name', 'Application'),
    farm(),
    ref('planting', 'Planting', 'plantings'),
    sel('kind', 'Application type', 'Fertilizer|Manure|Spraying|Seed treatment'),
    f('product', 'Product'),
    n('quantity', 'Quantity', true, 0.01),
    f('unit', 'Unit'),
    d('date', 'Application date'),
    d('next_due', 'Next application', false),
    n('cost', 'Cost', false),
    f('operator', 'Operator'),
    notes,
  ],
  'Record fertilizer, manure and crop protection applications.',
);
add(
  'scouting',
  'Pest & disease',
  'Land & crops',
  [
    f('name', 'Observation'),
    farm(),
    ref('planting', 'Planting', 'plantings'),
    d('date', 'Scouting date'),
    f('pest', 'Pest or disease'),
    sel('severity', 'Severity', 'Low|Medium|High|Critical'),
    f('symptoms', 'Observed symptoms', 'textarea'),
    f('control', 'Control measures / agronomist advice', 'textarea', false),
    sel('status', 'Status', 'Open|Treating|Resolved'),
    f('effectiveness', 'Treatment effectiveness', 'textarea', false),
    notes,
  ],
  'Track scouting, treatments and outbreak severity.',
);
add(
  'harvests',
  'Harvests',
  'Land & crops',
  [
    f('name', 'Harvest batch'),
    farm(),
    ref('planting', 'Planting', 'plantings'),
    d('date', 'Harvest date'),
    n('quantity', 'Gross harvest (kg)', true, 0.01),
    n('loss', 'Loss / wastage (kg)'),
    sel('grade', 'Grade', 'A|B|C|Ungraded'),
    ref('item', 'Produce stock item (kg)', 'inventory', false),
    ref('warehouse', 'Storage location', 'warehouses', false),
    f('handling', 'Handling and packaging', 'textarea', false),
    notes,
  ],
  'Record actual production, losses, quality and stock received.',
);
// Livestock identification, health and production
add(
  'animals',
  'Animals',
  'Livestock',
  [
    f('name', 'Animal identification'),
    farm(),
    sel('species', 'Species', 'Cattle|Goat|Sheep|Pig|Chicken|Duck|Other'),
    f('breed', 'Breed'),
    sel('sex', 'Sex', 'Female|Male|Unknown'),
    d('birth_date', 'Birth date', false),
    n('weight', 'Weight (kg)', false),
    sel('status', 'Status', 'Active|Sold|Dead'),
    d('death_date', 'Death date', false),
    f('death_cause', 'Cause of death', 'textarea', false),
    notes,
  ],
  'Register livestock, births, identification and mortality.',
);
add(
  'animal_health',
  'Health & vaccinations',
  'Livestock',
  [
    f('name', 'Health record'),
    farm(),
    ref('animal', 'Animal', 'animals'),
    sel('kind', 'Type', 'Vaccination|Treatment|Examination'),
    d('date', 'Date'),
    f('medicine', 'Medicine / vaccine', 'text', false),
    f('dose', 'Dose', 'text', false),
    f('diagnosis', 'Diagnosis', 'textarea', false),
    d('next_due', 'Next due', false),
    n('cost', 'Cost', false),
    f('vet', 'Veterinarian', 'text', false),
    notes,
  ],
  'Keep vaccination schedules and veterinary treatment history.',
);
add(
  'feeding',
  'Feed & growth',
  'Livestock',
  [
    f('name', 'Feed / growth record'),
    farm(),
    ref('animal', 'Animal', 'animals'),
    d('date', 'Date'),
    f('feed', 'Feed'),
    n('quantity', 'Feed (kg)', true, 0.01),
    n('weight', 'Measured weight (kg)', false),
    n('cost', 'Cost', false),
    notes,
  ],
  'Track feeding, feed costs and animal growth.',
);
add(
  'breeding',
  'Breeding',
  'Livestock',
  [
    f('name', 'Breeding record'),
    farm(),
    ref('animal', 'Dam', 'animals'),
    ref('sire', 'Sire', 'animals', false),
    d('date', 'Breeding date'),
    d('next_due', 'Expected birth', false),
    sel('status', 'Outcome', 'Pending|Confirmed|Delivered|Unsuccessful'),
    n('offspring', 'Offspring count', false),
    notes,
  ],
  'Manage breeding and expected births.',
);
add(
  'animal_production',
  'Livestock production',
  'Livestock',
  [
    f('name', 'Production record'),
    farm(),
    ref('animal', 'Animal', 'animals'),
    d('date', 'Date'),
    sel('product', 'Product', 'Milk|Eggs|Wool|Meat|Other'),
    n('quantity', 'Quantity', true, 0.01),
    f('unit', 'Unit'),
    n('value', 'Estimated value', false),
    notes,
  ],
  'Record livestock output and production value.',
);
// Water, stock, machinery and storage
add(
  'water_sources',
  'Water sources',
  'Resources',
  [
    f('name', 'Water source'),
    farm(),
    sel('kind', 'Type', 'Borehole|River|Dam|Tank|Municipal|Other'),
    n('capacity', 'Capacity (m³)', false),
    sel('status', 'Status', 'Operational|Low|Unavailable'),
    notes,
  ],
  'Register water sources and available capacity.',
);
add(
  'irrigation_systems',
  'Irrigation systems',
  'Resources',
  [
    f('name', 'System name'),
    farm(),
    ref('source', 'Water source', 'water_sources'),
    sel('kind', 'System type', 'Drip|Sprinkler|Flood|Pivot|Other'),
    f('pump', 'Pump / equipment', 'text', false),
    sel('status', 'Status', 'Operational|Maintenance|Fault'),
    notes,
  ],
  'Manage irrigation infrastructure and faults.',
);
add(
  'irrigation',
  'Irrigation schedule',
  'Resources',
  [
    f('name', 'Irrigation task'),
    farm(),
    ref('field', 'Field', 'fields'),
    ref('system', 'Irrigation system', 'irrigation_systems'),
    d('date', 'Scheduled date'),
    n('water', 'Water used (m³)'),
    n('hours', 'Pump operating hours'),
    n('cost', 'Cost'),
    sel('status', 'Status', 'Scheduled|Completed|Problem|Cancelled'),
    notes,
  ],
  'Schedule irrigation and track water use, operating time and costs.',
);
add(
  'inventory',
  'Inventory',
  'Resources',
  [
    f('name', 'Stock item'),
    farm(),
    sel(
      'category',
      'Category',
      'Seed|Fertilizer|Chemical|Feed|Veterinary|Packaging|Fuel|Tool|Produce|Other',
    ),
    f('unit', 'Unit (use kg for harvest produce)'),
    n('opening', 'Opening quantity'),
    n('minimum', 'Low-stock threshold'),
    n('unit_cost', 'Unit value'),
    d('expiry', 'Expiry date', false),
    notes,
  ],
  'Track inputs and produce with balances calculated from stock movements.',
);
add(
  'stock_moves',
  'Stock movements',
  'Resources',
  [
    f('name', 'Movement reference'),
    farm(),
    ref('item', 'Item', 'inventory'),
    sel('direction', 'Direction', 'In|Out'),
    n('quantity', 'Quantity', true, 0.01),
    d('date', 'Date'),
    sel('reason', 'Reason', 'Purchase adjustment|Consumption|Transfer|Spoilage|Return|Correction'),
    ref('warehouse', 'Warehouse', 'warehouses', false),
    notes,
  ],
  'Record stock additions and usage. Sales, received purchases and linked harvests also affect balances.',
);
add(
  'equipment',
  'Equipment',
  'Resources',
  [
    f('name', 'Equipment name'),
    farm(),
    f('serial', 'Registration / serial'),
    sel('kind', 'Type', 'Tractor|Pump|Vehicle|Sprayer|Tool|Other'),
    d('purchased_on', 'Purchase date'),
    n('cost', 'Purchase value'),
    n('salvage', 'Residual value'),
    n('useful_years', 'Useful life (years)', true, 1),
    n('hours', 'Operating hours'),
    sel('status', 'Status', 'Available|Allocated|Maintenance|Retired'),
    f('allocated_to', 'Allocated to', 'text', false),
    d('next_due', 'Next maintenance', false),
    notes,
  ],
  'Track machinery, allocation and straight-line depreciation.',
);
add(
  'maintenance',
  'Maintenance & fuel',
  'Resources',
  [
    f('name', 'Maintenance record'),
    farm(),
    ref('equipment', 'Equipment', 'equipment'),
    d('date', 'Date'),
    sel('kind', 'Work type', 'Service|Repair|Fuel|Inspection'),
    n('fuel', 'Fuel (litres)'),
    n('hours', 'Operating hours'),
    n('cost', 'Cost'),
    d('next_due', 'Next service', false),
    notes,
  ],
  'Record equipment service, repairs, fuel and operating costs.',
);
add(
  'warehouses',
  'Storage locations',
  'Resources',
  [
    f('name', 'Storage name'),
    farm(),
    sel('kind', 'Type', 'Warehouse|Cold room|Silo|Open storage|Other'),
    n('capacity', 'Capacity (kg)', true, 0.01),
    n('temperature', 'Target temperature (°C)', false, -100),
    f('location', 'Location'),
    notes,
  ],
  'Register warehouses and cold storage.',
);
add(
  'storage_lots',
  'Storage lots',
  'Resources',
  [
    f('name', 'Lot reference'),
    farm(),
    ref('item', 'Item', 'inventory'),
    ref('warehouse', 'Warehouse', 'warehouses'),
    d('date', 'Stored date'),
    n('quantity', 'Quantity stored (kg)', true, 0.01),
    n('spoilage', 'Spoilage (kg)'),
    sel('grade', 'Quality', 'A|B|C|At risk'),
    d('dispatch_on', 'Dispatch date', false),
    f('destination', 'Dispatch destination', 'text', false),
    notes,
  ],
  'Track storage duration, quality and dispatch. Record stock adjustments separately to avoid double counting.',
);
// Labour and work allocation
add(
  'employees',
  'Employees',
  'People & work',
  [
    f('name', 'Employee name'),
    farm(),
    f('role', 'Job role'),
    f('phone', 'Phone', 'tel', false),
    d('start_date', 'Start date'),
    n('daily_rate', 'Daily pay rate'),
    sel('status', 'Status', 'Active|On leave|Inactive'),
    notes,
  ],
  'Manage farm workers, roles and pay rates.',
);
add(
  'tasks',
  'Tasks',
  'People & work',
  [
    f('name', 'Task'),
    farm(),
    ref('employee', 'Assigned employee', 'employees', false),
    d('date', 'Due date'),
    sel('priority', 'Priority', 'Low|Normal|High'),
    sel('status', 'Status', 'To do|In progress|Done|Cancelled'),
    n('hours', 'Hours worked'),
    n('output', 'Output quantity', false),
    f('unit', 'Output unit', 'text', false),
    notes,
  ],
  'Allocate daily work and monitor progress and productivity.',
);
add(
  'attendance',
  'Attendance',
  'People & work',
  [
    f('name', 'Attendance reference'),
    farm(),
    ref('employee', 'Employee', 'employees'),
    d('date', 'Date'),
    sel('status', 'Status', 'Present|Half day|Absent|Leave'),
    n('hours', 'Hours worked'),
    n('pay', 'Pay earned'),
    notes,
  ],
  'Record attendance and earned pay for payroll export.',
);
// Procurement, sales and finance
add(
  'suppliers',
  'Suppliers',
  'Trade & finance',
  [
    f('name', 'Supplier name'),
    f('contact', 'Contact person'),
    f('email', 'Email', 'email', false),
    f('phone', 'Phone', 'tel', false),
    f('products', 'Products supplied', 'textarea', false),
    n('rating', 'Performance rating (0–5)', false),
    f('agreement', 'Agreement terms', 'textarea', false),
    notes,
  ],
  'Keep supplier contacts, performance and agreements.',
);
add(
  'purchases',
  'Procurement',
  'Trade & finance',
  [
    f('name', 'Purchase order number'),
    farm(),
    ref('supplier', 'Supplier', 'suppliers'),
    ref('item', 'Stock item', 'inventory'),
    n('quantity', 'Quantity', true, 0.01),
    n('unit_price', 'Unit price'),
    d('date', 'Order date'),
    d('next_due', 'Expected delivery', false),
    sel('status', 'Status', 'Quotation|Pending approval|Approved|Received|Cancelled'),
    f('terms', 'Payment / quotation terms', 'textarea', false),
    notes,
  ],
  'Approve purchases and receive stock. Only received orders increase inventory.',
);
add(
  'customers',
  'Customers',
  'Trade & finance',
  [
    f('name', 'Customer name'),
    f('contact', 'Contact person'),
    f('email', 'Email', 'email', false),
    f('phone', 'Phone', 'tel', false),
    f('destination', 'Market destination', 'text', false),
    f('agreement', 'Contract / agreement terms', 'textarea', false),
    notes,
  ],
  'Manage buyers, market destinations and contract terms.',
);
add(
  'sales',
  'Sales & invoices',
  'Trade & finance',
  [
    f('name', 'Invoice number'),
    farm(),
    ref('customer', 'Customer', 'customers'),
    ref('item', 'Stock item', 'inventory'),
    n('quantity', 'Quantity', true, 0.01),
    n('unit_price', 'Unit price'),
    d('date', 'Invoice date'),
    d('next_due', 'Payment due', false),
    sel('status', 'Status', 'Draft|Confirmed|Cancelled'),
    f('destination', 'Delivery destination', 'text', false),
    notes,
  ],
  'Issue printable invoices and record sales. Confirmed invoices reduce stock.',
);
add(
  'payments',
  'Payments',
  'Trade & finance',
  [
    f('name', 'Payment reference'),
    farm(),
    sel('direction', 'Direction', 'Income|Expense'),
    sel(
      'category',
      'Category',
      'Sales|Inputs|Labour|Fuel|Equipment|Veterinary|Irrigation|Loan|Other',
    ),
    ref('sale', 'Sales invoice', 'sales', false),
    ref('purchase', 'Purchase order', 'purchases', false),
    ref('planting', 'Planting / cost allocation', 'plantings', false),
    d('date', 'Payment date'),
    n('amount', 'Amount', true, 0.01),
    sel('method', 'Method', 'Cash|Bank transfer|Mobile money|Cheque|Other'),
    notes,
  ],
  'Track actual income and expenditure. Invoice totals and cash flow are reported separately.',
);
add(
  'budgets',
  'Budgets',
  'Trade & finance',
  [
    f('name', 'Budget name'),
    farm(),
    sel('category', 'Category', 'Inputs|Labour|Fuel|Equipment|Veterinary|Irrigation|Loan|Other'),
    d('date', 'Start date'),
    d('end_date', 'End date'),
    n('amount', 'Budget amount', true, 0.01),
    notes,
  ],
  'Compare planned spending with recorded cash expenditure.',
);
add(
  'loans',
  'Loans',
  'Trade & finance',
  [
    f('name', 'Loan reference'),
    farm(),
    f('lender', 'Lender'),
    n('principal', 'Principal', true, 0.01),
    n('rate', 'Annual interest rate (%)'),
    d('date', 'Start date'),
    d('next_due', 'Repayment due'),
    n('repaid', 'Principal repaid'),
    sel('status', 'Status', 'Active|Settled'),
    notes,
  ],
  'Track borrowing, principal repayments and due dates.',
);
// Market and environmental observations
add(
  'market_prices',
  'Market prices',
  'Insights',
  [
    f('name', 'Price observation'),
    ref('crop', 'Crop variety', 'crops'),
    f('market', 'Market'),
    d('date', 'Observation date'),
    n('price', 'Price per kg', true, 0.01),
    sel('demand', 'Demand', 'Low|Normal|High'),
    f('source', 'Source'),
    notes,
  ],
  'Record sourced market prices and compare price and demand trends.',
);
add(
  'weather_logs',
  'Weather records',
  'Insights',
  [
    f('name', 'Weather observation'),
    farm(),
    d('date', 'Date'),
    n('rainfall', 'Rainfall (mm)'),
    n('temperature', 'Temperature (°C)', true, -100),
    n('humidity', 'Humidity (%)'),
    n('wind', 'Wind speed (km/h)'),
    f('source', 'Source'),
    notes,
  ],
  'Keep local rainfall and environmental history alongside live forecasts.',
);
fs.writeFileSync('src/catalog.json', JSON.stringify(modules, null, 2));
console.log(Object.keys(modules).length + ' operational modules');
