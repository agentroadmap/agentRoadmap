/**
 * S104 Tests: Agent Activity Monitoring & Anomaly Detection
 */
import { describe, it, expect } from 'vitest';
import { checkProposalCount, checkRateLimit, checkDuplicates, AgentEvent } from '../core/agent-monitor';

describe('S104: Agent Activity Monitoring', () => {
  // AC#1: Proposal count monitor
  describe('checkProposalCount', () => {
    it('should return null when under 150', () => {
      expect(checkProposalCount(100)).toBeNull();
    });
    
    it('should warn at 151', () => {
      const alert = checkProposalCount(151);
      expect(alert?.severity).toBe('warn');
    });
    
    it('should critical at 201', () => {
      const alert = checkProposalCount(201);
      expect(alert?.severity).toBe('critical');
    });
  });

  // AC#2: Rate limiter  
  describe('checkRateLimit', () => {
    it('should allow normal rate', () => {
      const events: AgentEvent[] = Array(5).fill(null).map((_, i) => ({
        agent_id: 'test-agent',
        action: 'create' as const,
        proposal_id: `S${i}`,
        timestamp: Date.now() - i * 60000
      }));
      expect(checkRateLimit(events, 'test-agent')).toBeNull();
    });

    it('should flag rate >10/hour', () => {
      const events: AgentEvent[] = Array(12).fill(null).map((_, i) => ({
        agent_id: 'test-agent',
        action: 'create' as const,
        proposal_id: `S${i}`,
        timestamp: Date.now() - i * 60000
      }));
      const alert = checkRateLimit(events, 'test-agent');
      expect(alert?.type).toBe('rate_limit');
    });
  });

  // AC#3: Duplication detector
  describe('checkDuplicates', () => {
    it('should return null when no duplicates', () => {
      const proposals = [
        { title: 'Feature A', created_at: Date.now() - 1000 },
        { title: 'Feature B', created_at: Date.now() - 2000 },
      ];
      expect(checkDuplicates(proposals, 'test')).toBeNull();
    });

    it('should flag 3+ duplicates', () => {
      const proposals = [
        { title: 'Same Feature', created_at: Date.now() - 1000 },
        { title: 'Same Feature', created_at: Date.now() - 2000 },
        { title: 'Same Feature', created_at: Date.now() - 3000 },
      ];
      const alert = checkDuplicates(proposals, 'test');
      expect(alert?.type).toBe('duplicate');
    });
  });
});
