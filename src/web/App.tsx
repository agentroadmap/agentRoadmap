import { useState, useEffect } from 'react'
import { Route, Switch } from 'wouter'
import { useWebSocket } from './hooks/useWebSocket'
import type { Proposal } from '../types'

import Layout from './components/Layout'
import DashboardPage from './components/DashboardPage'
import BoardPage from './components/BoardPage'
import ProposalDetailsModal from './components/ProposalDetailsModal'
import MapPage from './components/MapPage'
import AchievementsView from './components/AchievementsView'
import AgentsPage from './components/AgentsPage'
import KnowledgePage from './components/KnowledgePage'
import SearchResultsPage from './components/SearchResultsPage'
import StatisticsPage from './components/StatisticsPage'
import SettingsPage from './components/SettingsPage'
import ProposalsPage from './components/ProposalsPage'
import DirectivesPage from './components/DirectivesPage'
import AgentDashboard from './components/AgentDashboard'
import TeamsPage from './components/TeamsPage'
import DocumentsPage from './components/DocumentsPage'
import DecisionsPage from './components/DecisionsPage'
import ChannelsPage from './components/ChannelsPage'
import NotFoundPage from './components/NotFoundPage'

const STATUSES = ['New', 'Draft', 'Review', 'Active', 'Accepted', 'Complete', 'Rejected', 'Abandoned']

export default function App() {
  const { connected, proposals, agents, channels } = useWebSocket()
  const [activeFeature, setActiveFeature] = useState<string | null>(null)

  const handleProposalClick = (proposal: Proposal) => {
    setActiveFeature(proposal.id)
  }

  return (
    <div className="h-screen bg-gray-50 dark:bg-gray-900 flex overflow-hidden transition-colors duration-200">
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        <main className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden">
          <Switch>
        <Route path="/">
          <DashboardPage proposals={proposals as Proposal[]} agents={agents} />
        </Route>
        <Route path="/board">
          <BoardPage
            proposals={proposals as Proposal[]}
            statuses={STATUSES}
            onProposalClick={handleProposalClick}
          />
        </Route>
        <Route path="/proposals">
          <ProposalsPage proposals={proposals} />
        </Route>
        <Route path="/directives">
          <DirectivesPage proposals={proposals} />
        </Route>
        <Route path="/agents">
          <AgentsPage agents={agents} />
        </Route>
        <Route path="/teams">
          <TeamsPage />
        </Route>
        <Route path="/channels">
          <ChannelsPage channels={channels} />
        </Route>
        <Route path="/statistics">
          <StatisticsPage proposals={proposals} />
        </Route>
        <Route path="/agent-dashboard">
          <AgentDashboard />
        </Route>
        <Route path="/knowledge">
          <KnowledgePage />
        </Route>
        <Route path="/documents">
          <DocumentsPage />
        </Route>
        <Route path="/decisions">
          <DecisionsPage />
        </Route>
        <Route path="/map">
          <MapPage />
        </Route>
        <Route path="/achievements">
          <AchievementsView />
        </Route>
        <Route path="/settings">
          <SettingsPage />
        </Route>
        <Route component={NotFoundPage} />
      </Switch>
      {activeFeature && (
        <ProposalDetailsModal
          proposal={proposals.find(p => p.id === activeFeature) as Proposal | undefined}
          onClose={() => setActiveFeature(null)}
        />
      )}
        </main>
      </div>
    </div>
  )
}
