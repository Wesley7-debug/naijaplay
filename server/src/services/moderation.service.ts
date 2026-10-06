import { PROFANITY_LIST, type ReportReason, type ReportTarget, type ReportStatus } from '@naijaplay/shared';
import { Report, type ReportDoc } from '../models/index.js';
import { AppError } from '../utils/errors.js';

const STRONG_PATTERNS = [
  /\bn+i+g+(g|a|er|ga)\b/i,
  /\bf+u+c+k+(er|ing|s)?\b/i,
  /\bb+i+t+c+h+(es|y)?\b/i,
  /\ba+s+s+h+o+l+e\b/i,
  /\bb+a+s+t+a+r+d\b/i,
  /\br+e+t+a+r+d+(ed|s)?\b/i,
];

export interface ModerationResult {
  flagged: boolean;
  severity: 'none' | 'mild' | 'strong';
  matches: string[];
}

/**
 * Profanity filter — flags messages but never auto-bans on a keyword.
 * Severity feeds rate limiting / shadow review, human moderators decide bans.
 */
export function moderateText(text: string): ModerationResult {
  if (!text) return { flagged: false, severity: 'none', matches: [] };
  const normalized = text.toLowerCase().replace(/[^\w\s]/g, ' ');
  const matches: string[] = [];

  for (const pattern of STRONG_PATTERNS) {
    const m = normalized.match(pattern);
    if (m) matches.push(m[0]);
  }
  for (const word of PROFANITY_LIST) {
    const re = new RegExp(`\\b${word}\\b`, 'i');
    if (re.test(normalized) && !matches.includes(word)) matches.push(word);
  }
  if (matches.length === 0) return { flagged: false, severity: 'none', matches: [] };
  const strong = STRONG_PATTERNS.some((p) => p.test(normalized));
  return { flagged: true, severity: strong ? 'strong' : 'mild', matches };
}

/** Soft spam heuristic: repeated characters/links/emoji walls. */
export function looksSpammy(text: string): boolean {
  if (!text) return false;
  if (/(.)\1{9,}/.test(text)) return true;
  const links = (text.match(/https?:\/\//gi) || []).length;
  if (links >= 3) return true;
  const words = text.trim().split(/\s+/);
  if (words.length >= 4 && new Set(words).size <= 2) return true;
  return false;
}

export function assertCleanText(text: string, context: 'message' | 'moment' | 'comment'): void {
  const result = moderateText(text);
  if (result.severity === 'strong') {
    throw AppError.badRequest(
      'CONTENT_FLAGGED',
      context === 'message'
        ? 'That message contains language the community guidelines do not allow.'
        : 'That contains language the community guidelines do not allow.',
    );
  }
}

export interface CreateReportInput {
  reporterId: string;
  targetType: ReportTarget;
  targetId: string;
  targetLabel?: string;
  reason: ReportReason;
  description?: string;
}

export async function resolveReport(
  reportId: string,
  moderatorId: string,
  status: 'reviewing' | 'resolved' | 'dismissed',
  resolution?: string,
): Promise<ReportDoc> {
  const report = await Report.findById(reportId);
  if (!report) throw AppError.notFound('REPORT_NOT_FOUND', 'Report not found.');
  report.status = status;
  report.moderatorId = moderatorId as never;
  report.resolution = resolution || '';
  if (status === 'resolved' || status === 'dismissed') report.resolvedAt = new Date();
  await report.save();
  return report;
}

export async function createReport(input: CreateReportInput): Promise<ReportDoc> {
  const existing = await Report.findOne({
    reporterId: input.reporterId,
    targetType: input.targetType,
    targetId: input.targetId,
    status: { $in: ['open', 'reviewing'] },
  });
  if (existing) {
    throw AppError.conflict('REPORT_EXISTS', 'You already reported this. Our moderators are on it.');
  }
  return Report.create({
    reporterId: input.reporterId,
    targetType: input.targetType,
    targetId: input.targetId,
    targetLabel: input.targetLabel || '',
    reason: input.reason,
    description: input.description || '',
    status: 'open' as ReportStatus,
  });
}
