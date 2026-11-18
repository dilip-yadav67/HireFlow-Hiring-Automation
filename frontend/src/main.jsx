import React from "react"; import { createRoot } from "react-dom/client"; import App from "./App.jsx"; import { loadUi, applyUi } from "./ui.js"; import "./index.css";
applyUi(loadUi());
createRoot(document.getElementById("root")).render(<App />);
