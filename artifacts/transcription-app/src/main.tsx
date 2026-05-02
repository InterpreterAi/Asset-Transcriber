import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const THEME_KEY = "interpreterai-theme";
try {
  const pref = typeof localStorage !== "undefined" ? localStorage.getItem(THEME_KEY) : null;
  document.documentElement.classList.toggle("dark", pref !== "light");
} catch {
  document.documentElement.classList.add("dark");
}

createRoot(document.getElementById("root")!).render(<App />);
