import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { HealthCheckProvider } from "./contexts/HealthCheckContext";
import { ThemeProvider } from "./contexts/ThemeContext";

const root = ReactDOM.createRoot(
	document.getElementById("root") as HTMLElement,
);
root.render(
	<React.StrictMode>
		<ThemeProvider>
			<HealthCheckProvider>
				<App />
			</HealthCheckProvider>
		</ThemeProvider>
	</React.StrictMode>,
);
