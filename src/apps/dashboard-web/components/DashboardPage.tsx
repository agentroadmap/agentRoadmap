import type React from "react";
import type { Proposal } from "../../../shared/types";
import AchievementsView from "./AchievementsView";
import ActivityFeed from "./ActivityFeed";
import AgentDashboard from "./AgentDashboard";
import MessageStream from "./MessageStream";

interface DashboardPageProps {
	proposals: Proposal[];
}

const DashboardPage: React.FC<DashboardPageProps> = ({ proposals }) => {
	return (
		<div className="space-y-6">
			<AgentDashboard proposals={proposals} />
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<div style={{ height: "500px" }}>
					<ActivityFeed />
				</div>
				<div style={{ height: "500px" }}>
					<MessageStream />
				</div>
			</div>
			<AchievementsView proposals={proposals} />
		</div>
	);
};

export default DashboardPage;
