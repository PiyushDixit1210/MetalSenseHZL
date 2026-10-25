import { relations } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

// Users table linked to Firebase Auth UID + Enterprise RBAC & Password Hash
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  role: text('role').default('Executive Viewer'), // 'Executive Viewer' | 'Marketing Manager' | 'Sales Executive'
  assignedRegion: text('assigned_region').default('All India'), // 'All India' | 'West' | 'East' | 'North' | 'South'
  passwordHash: text('password_hash'),
  lastLoginAt: timestamp('last_login_at').defaultNow(),
  createdAt: timestamp('created_at').defaultNow(),
});

// 1. market_prices
export const marketPrices = pgTable('market_prices', {
  id: serial('id').primaryKey(),
  date: text('date').notNull(), // YYYY-MM-DD or timestamp
  metal: text('metal').notNull(), // Zinc, Lead, Silver, Cadmium
  exchangeLme: doublePrecision('exchange_lme').notNull(), // USD/MT (or USD/oz for Silver)
  exchangeShfe: doublePrecision('exchange_shfe').notNull(), // CNY/MT (or CNY/kg for Silver)
  exchangeMcx: doublePrecision('exchange_mcx').notNull(), // INR/kg
  exchangeCme: doublePrecision('exchange_cme').notNull(), // USD/MT or USD/oz
  inrUsdRate: doublePrecision('inr_usd_rate').notNull(), // Live INR/USD rate
  physicalPremiumIndia: doublePrecision('physical_premium_india').notNull(), // USD/MT over LME (or USD/oz)
  scenarioTag: text('scenario_tag').default('Baseline'),
  sourceApi: text('source_api').default('Historical Seed'),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 2. exim_imports
export const eximImports = pgTable('exim_imports', {
  id: serial('id').primaryKey(),
  date: text('date').notNull(),
  metal: text('metal').notNull(),
  grade: text('grade').notNull(),
  hsCode: text('hs_code').notNull(),
  importerName: text('importer_name').notNull(),
  customerLocation: text('customer_location').notNull(),
  originCountry: text('origin_country').notNull(),
  port: text('port').notNull(),
  dutyScheme: text('duty_scheme').notNull(),
  volumeMt: doublePrecision('volume_mt').notNull(),
  cifPriceUsd: doublePrecision('cif_price_usd').notNull(),
  landedCostInr: doublePrecision('landed_cost_inr').notNull(),
});

// 3. internal_sales
export const internalSales = pgTable('internal_sales', {
  id: serial('id').primaryKey(),
  date: text('date').notNull(),
  customerId: text('customer_id').notNull(),
  customerName: text('customer_name').notNull(),
  customerSegment: text('customer_segment').notNull(),
  region: text('region').notNull(),
  metal: text('metal').notNull(),
  grade: text('grade').notNull(),
  volumeMt: doublePrecision('volume_mt').notNull(),
  realizedPremiumUsd: doublePrecision('realized_premium_usd').notNull(),
  saleTypeLtcOrAuction: text('sale_type_ltc_or_auction').notNull(),
});

// 4. market_intelligence
export const marketIntelligence = pgTable('market_intelligence', {
  id: serial('id').primaryKey(),
  timestamp: text('timestamp').notNull(),
  source: text('source').notNull(),
  headline: text('headline').notNull(),
  summary: text('summary').notNull(),
  impactScore: doublePrecision('impact_score').notNull(),
  sentimentTag: text('sentiment_tag').notNull(),
  affectedMetal: text('affected_metal').notNull(),
  category: text('category').notNull(),
  embedding: text('embedding').notNull(),
});

// 5. saved_simulations
export const savedSimulations = pgTable('saved_simulations', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  scenarioName: text('scenario_name').notNull(),
  metal: text('metal').notNull(),
  grade: text('grade').notNull(),
  region: text('region').notNull(),
  availableVolumeMt: doublePrecision('available_volume_mt').notNull(),
  ltcAllocationPct: doublePrecision('ltc_allocation_pct').notNull(),
  spotAuctionPct: doublePrecision('spot_auction_pct').notNull(),
  expectedPremiumUsd: doublePrecision('expected_premium_usd').notNull(),
  projectedNsrUsdM: doublePrecision('projected_nsr_usd_m').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// 6. alert_rules (Custom Alerting & Threshold Configuration)
export const alertRules = pgTable('alert_rules', {
  id: serial('id').primaryKey(),
  ruleName: text('rule_name').notNull(),
  metal: text('metal').notNull(), // Zinc, Lead, Silver, Cadmium
  region: text('region').notNull(), // All India, West, East, North, South
  metricType: text('metric_type').notNull(), // Import Parity Trigger, LME/SHFE Threshold, Forecast Deviation, Critical News Event
  conditionOperator: text('condition_operator').notNull(), // >, <, >=, <=
  thresholdValue: doublePrecision('threshold_value').notNull(),
  severity: text('severity').notNull(), // Critical, High, Medium
  notifyInApp: boolean('notify_in_app').default(true).notNull(),
  notifyEmail: boolean('notify_email').default(true).notNull(),
  recipientEmail: text('recipient_email').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// 7. alert_notifications (Triggered In-App & Email Alert Log)
export const alertNotifications = pgTable('alert_notifications', {
  id: serial('id').primaryKey(),
  ruleId: integer('rule_id'),
  title: text('title').notNull(),
  metal: text('metal').notNull(),
  region: text('region').notNull(),
  metricType: text('metric_type').notNull(),
  severity: text('severity').notNull(), // Critical, High, Medium
  causeSummary: text('cause_summary').notNull(),
  impactAssessment: text('impact_assessment').notNull(),
  deliveryChannels: text('delivery_channels').notNull(), // In-App + Email, In-App Only
  emailRecipient: text('email_recipient').notNull(),
  emailStatus: text('email_status').notNull(), // Dispatched, Delivered, In-App Only
  isRead: boolean('is_read').default(false).notNull(),
  triggeredAt: text('triggered_at').notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  simulations: many(savedSimulations),
}));

export const savedSimulationsRelations = relations(savedSimulations, ({ one }) => ({
  user: one(users, {
    fields: [savedSimulations.userId],
    references: [users.id],
  }),
}));
