import { desc, eq } from 'drizzle-orm';
import { db } from './index.ts';
import {
  alertNotifications,
  alertRules,
  eximImports,
  internalSales,
  marketIntelligence,
  marketPrices,
  savedSimulations,
} from './schema.ts';

export async function getAllMarketPrices() {
  try {
    return await db.select().from(marketPrices).orderBy(marketPrices.id);
  } catch (error) {
    console.error('Database query getAllMarketPrices failed:', error);
    throw new Error('Failed to retrieve market prices from database.', { cause: error });
  }
}

export async function insertOrUpdateLiveMarketPrice(item: {
  date: string;
  metal: string;
  exchangeLme: number;
  exchangeShfe: number;
  exchangeMcx: number;
  exchangeCme: number;
  inrUsdRate: number;
  physicalPremiumIndia: number;
  scenarioTag: string;
  sourceApi: string;
}) {
  try {
    const inserted = await db
      .insert(marketPrices)
      .values({
        ...item,
        updatedAt: new Date(),
      })
      .returning();
    return inserted[0];
  } catch (error) {
    console.error('Database insertOrUpdateLiveMarketPrice failed:', error);
    throw new Error('Failed to update market_prices table with live feed.', {
      cause: error,
    });
  }
}

export async function getAllEximImports() {
  try {
    return await db.select().from(eximImports).orderBy(desc(eximImports.date));
  } catch (error) {
    console.error('Database query getAllEximImports failed:', error);
    throw new Error('Failed to retrieve EXIM import records from database.', { cause: error });
  }
}

export async function insertEximImport(data: {
  date: string;
  metal: string;
  grade: string;
  hsCode: string;
  importerName: string;
  customerLocation: string;
  originCountry: string;
  port: string;
  dutyScheme: string;
  volumeMt: number;
  cifPriceUsd: number;
  landedCostInr: number;
}) {
  try {
    const result = await db.insert(eximImports).values(data).returning();
    return result[0];
  } catch (error) {
    console.error('Database insertEximImport failed:', error);
    throw new Error('Failed to record EXIM shipment in database.', { cause: error });
  }
}

export async function getAllInternalSales() {
  try {
    return await db.select().from(internalSales).orderBy(internalSales.date);
  } catch (error) {
    console.error('Database query getAllInternalSales failed:', error);
    throw new Error('Failed to retrieve internal ERP sales from database.', { cause: error });
  }
}

export async function getAllMarketIntelligence() {
  try {
    return await db
      .select()
      .from(marketIntelligence)
      .orderBy(desc(marketIntelligence.timestamp));
  } catch (error) {
    console.error('Database query getAllMarketIntelligence failed:', error);
    throw new Error('Failed to retrieve market intelligence feed from database.', {
      cause: error,
    });
  }
}

export async function insertMarketIntelligenceItem(item: {
  timestamp: string;
  source: string;
  headline: string;
  summary: string;
  impactScore: number;
  sentimentTag: string;
  affectedMetal: string;
  category: string;
  embedding: string;
}) {
  try {
    const result = await db.insert(marketIntelligence).values(item).returning();
    return result[0];
  } catch (error) {
    console.error('Database insertMarketIntelligenceItem failed:', error);
    throw new Error('Failed to store market intelligence item in database.', {
      cause: error,
    });
  }
}

export async function getUserSimulations(userId: number) {
  try {
    return await db
      .select()
      .from(savedSimulations)
      .where(eq(savedSimulations.userId, userId))
      .orderBy(desc(savedSimulations.createdAt));
  } catch (error) {
    console.error('Database getUserSimulations failed:', error);
    throw new Error('Failed to fetch saved commercial simulations.', { cause: error });
  }
}

export async function insertUserSimulation(sim: {
  userId: number;
  scenarioName: string;
  metal: string;
  grade: string;
  region: string;
  availableVolumeMt: number;
  ltcAllocationPct: number;
  spotAuctionPct: number;
  expectedPremiumUsd: number;
  projectedNsrUsdM: number;
}) {
  try {
    const result = await db.insert(savedSimulations).values(sim).returning();
    return result[0];
  } catch (error) {
    console.error('Database insertUserSimulation failed:', error);
    throw new Error('Failed to save commercial simulation.', { cause: error });
  }
}

// Alert Rules & Notifications Queries
export async function getAllAlertRules() {
  try {
    return await db.select().from(alertRules).orderBy(desc(alertRules.id));
  } catch (error) {
    console.error('Database getAllAlertRules failed:', error);
    throw new Error('Failed to retrieve alert rules.', { cause: error });
  }
}

export async function createAlertRule(rule: {
  ruleName: string;
  metal: string;
  region: string;
  metricType: string;
  conditionOperator: string;
  thresholdValue: number;
  severity: string;
  notifyInApp: boolean;
  notifyEmail: boolean;
  recipientEmail: string;
  isActive?: boolean;
}) {
  try {
    const result = await db
      .insert(alertRules)
      .values({
        ...rule,
        isActive: rule.isActive ?? true,
      })
      .returning();
    return result[0];
  } catch (error) {
    console.error('Database createAlertRule failed:', error);
    throw new Error('Failed to create custom alert rule.', { cause: error });
  }
}

export async function updateAlertRuleStatus(id: number, isActive: boolean) {
  try {
    const result = await db
      .update(alertRules)
      .set({ isActive })
      .where(eq(alertRules.id, id))
      .returning();
    return result[0];
  } catch (error) {
    console.error('Database updateAlertRuleStatus failed:', error);
    throw new Error('Failed to toggle alert rule status.', { cause: error });
  }
}

export async function deleteAlertRuleById(id: number) {
  try {
    await db.delete(alertRules).where(eq(alertRules.id, id));
    return { deletedId: id };
  } catch (error) {
    console.error('Database deleteAlertRuleById failed:', error);
    throw new Error('Failed to delete alert rule.', { cause: error });
  }
}

export async function getAllAlertNotifications() {
  try {
    return await db
      .select()
      .from(alertNotifications)
      .orderBy(desc(alertNotifications.id));
  } catch (error) {
    console.error('Database getAllAlertNotifications failed:', error);
    throw new Error('Failed to retrieve alert notifications.', { cause: error });
  }
}

export async function createAlertNotification(notification: {
  ruleId?: number;
  title: string;
  metal: string;
  region: string;
  metricType: string;
  severity: string;
  causeSummary: string;
  impactAssessment: string;
  deliveryChannels: string;
  emailRecipient: string;
  emailStatus: string;
  triggeredAt: string;
}) {
  try {
    const result = await db
      .insert(alertNotifications)
      .values({
        ...notification,
        isRead: false,
      })
      .returning();
    return result[0];
  } catch (error) {
    console.error('Database createAlertNotification failed:', error);
    throw new Error('Failed to record alert notification.', { cause: error });
  }
}

export async function markNotificationRead(id: number) {
  try {
    const result = await db
      .update(alertNotifications)
      .set({ isRead: true })
      .where(eq(alertNotifications.id, id))
      .returning();
    return result[0];
  } catch (error) {
    console.error('Database markNotificationRead failed:', error);
    throw new Error('Failed to mark alert notification as read.', { cause: error });
  }
}

export async function markAllNotificationsRead() {
  try {
    await db.update(alertNotifications).set({ isRead: true });
    return { success: true };
  } catch (error) {
    console.error('Database markAllNotificationsRead failed:', error);
    throw new Error('Failed to mark all notifications as read.', { cause: error });
  }
}
