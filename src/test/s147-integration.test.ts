// S147 Integration Test: Real Agent Registration & Messaging
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { registerAgent, deregisterAgent, listAgents } from '../core/identity/agent-registry/index.ts';
import { sendMessage, getMessages } from '../core/messaging/agent-messaging/index.ts';
import { pingAgent } from '../core/identity/agent-health/index.ts';

describe('S147: Integration Test', () => {
  const instanceId = 'xTest1-' + Date.now().toString(36);
  const channel = 'agent-xTest1-' + instanceId.toLowerCase();
  
  it('should register agent, send message, and health check', async () => {
    // 1. Register
    const reg = await registerAgent({
      agentId: 'xTest1',
      instanceId,
      agentType: 'contract',
      capabilities: ['testing', 'messaging']
    });
    assert.strictEqual(reg.success, true);
    console.log('✅ Registered:', instanceId);
    
    // 2. List agents
    const agents = listAgents();
    const found = agents.find(a => a.instanceId === instanceId);
    assert.ok(found, 'Agent should appear in list');
    console.log('✅ Found in registry');
    
    // 3. Send message
    const msg = await sendMessage({
      from: 'orchestrator',
      to: instanceId,
      type: 'task',
      content: 'Hello agent! Prepare for work.'
    });
    assert.strictEqual(msg.success, true);
    console.log('✅ Message sent');
    
    // 4. Check inbox
    const inbox = await getMessages({ agentId: instanceId });
    assert.ok(inbox.length > 0, 'Should have messages');
    console.log('✅ Inbox received:', inbox.length, 'messages');
    
    // 5. Health check
    const health = await pingAgent({ agentId: instanceId });
    assert.ok(health, 'Should return health status');
    console.log('✅ Health check passed');
    
    // 6. Cleanup
    await deregisterAgent({ agentId: instanceId, reason: 'test complete' });
    console.log('✅ Cleanup done');
    
    console.log('\n=== S147 Integration Test: ALL PASSED ===');
  });
});
