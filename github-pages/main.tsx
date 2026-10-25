import { createRoot } from "react-dom/client";
import Dashboard from "../app/dashboard";
import "../app/globals.css";

const root = document.getElementById("root");
if (!root) throw new Error("Elemento principal do painel ausente.");

createRoot(root).render(<Dashboard />);
