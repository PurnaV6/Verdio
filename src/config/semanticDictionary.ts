import type { BusinessRole } from "../types/semantic";

/* ================================================================
   VERDIO — Semantic Dictionary
   Name-based evidence for each business role. These are matched as
   case-insensitive substrings against normalised column headers.
   Order within each array doesn't matter — semanticEngine scores
   every match, it doesn't stop at the first hit.

   This is intentionally a *starting* dictionary, not an exhaustive
   ontology — it's evidence, combined with value-pattern and
   cardinality checks in semanticEngine.ts, not a final verdict on
   its own. Extend this list as real-world uploads reveal gaps.
   ================================================================ */

export const NAME_HINTS: Record<BusinessRole, string[]> = {
  date: [
    'date', 'invoicedate', 'orderdate', 'created', 'createdat', 'timestamp',
    'time', 'day', 'period', 'transactiondate', 'purchasedate', 'shipdate',
  ],
  identifier: [
    'id', 'invoiceno', 'invoice no', 'orderid', 'order id', 'transactionid',
    'reference', 'ref no', 'uuid', 'code', 'stockcode', 'sku',
  ],
  product: [
    'product', 'item', 'description', 'sku', 'stockcode', 'productname',
    'productcategory', 'service', 'itemname',
  ],
  customer: [
    'customer', 'client', 'buyer', 'account', 'user', 'member', 'subscriber',
    'customerid', 'clientid', 'email', 'contact',
  ],
  category: [
    'category', 'segment', 'type', 'class', 'group', 'department', 'tag',
    'tier', 'status',
  ],
  quantity: [
    'quantity', 'qty', 'units', 'count', 'volume', 'stock', 'orderqty',
    'numberof', 'no of',
  ],
  price: [
    'price', 'unitprice', 'rate', 'cost per unit', 'priceperunit', 'listprice',
    'unit cost',
  ],
  cost: [
    'cost', 'expense', 'cogs', 'costofgoods', 'expenditure', 'spend',
  ],
  revenue: [
    'revenue', 'sales', 'total amount', 'totalamount', 'amount', 'total',
    'value', 'linetotal', 'extendedprice', 'turnover', 'income', 'gmv',
  ],
  percentage: [
    'percent', 'pct', 'rate', 'margin', 'ratio', 'discount',
  ],
  location: [
    'country', 'region', 'market', 'location', 'territory', 'city', 'state',
    'postcode', 'zip', 'address',
  ],
  employee: [
    'employee', 'staff', 'agent', 'rep', 'salesperson', 'manager', 'hire',
  ],
  inventory: [
    'inventory', 'stocklevel', 'warehouse', 'reorder', 'onhand', 'stock qty',
  ],
  duration: [
    'duration', 'tenure', 'length', 'daysto', 'timeto', 'lifespan', 'age',
  ],
  status: [
    'status', 'state', 'stage', 'flag', 'active', 'churned', 'cancelled',
  ],
  unknown: [],
};

/* Roles that require a numeric dataType — used by semanticEngine to
   discount name matches when the column's inferred type disagrees. */
export const NUMERIC_ROLES: BusinessRole[] = [
  'quantity', 'price', 'cost', 'revenue', 'percentage', 'duration', 'inventory',
];

export const DATE_ROLES: BusinessRole[] = ['date'];

/* Value-pattern regexes, checked against a sample of a column's raw values. */
export const VALUE_PATTERNS = {
  currencySymbol: /[£$€]/,
  email:          /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  percentSign:    /%\s*$/,
  isoDateLike:    /^\d{4}-\d{1,2}-\d{1,2}/,
  slashDateLike:  /^\d{1,2}[/.]\d{1,2}[/.]\d{2,4}$/,
  postcodeLike:   /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i,   // UK postcode
  skuLike:        /^[A-Z0-9]{4,12}$/,
  booleanLike:    /^(true|false|yes|no|y|n|0|1)$/i,
};

export const REVIEW_THRESHOLD = 0.6;   // confidence below this triggers needsReview
