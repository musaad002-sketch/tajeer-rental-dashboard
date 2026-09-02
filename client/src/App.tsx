import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import NewContractPage from "@/pages/NewContractPage";
import ContractHistoryPage from "@/pages/ContractHistoryPage";
import ContractDetailsPage from "@/pages/ContractDetailsPage";
import OperationsPage from "./pages/OperationsPage";
import VehicleDetailsPage from "./pages/VehicleDetailsPage";
import ReferenceLedgerPage from "./pages/ReferenceLedgerPage";
import CustomersPage from "./pages/CustomersPage";
import CustomerDetailsPage from "./pages/CustomerDetailsPage";
import ReportsPage from "./pages/ReportsPage";
import UsersPage from "./pages/UsersPage";
import VerifyEmailPage from "./pages/VerifyEmailPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import BlockedCustomersPage from "./pages/BlockedCustomersPage";
import VisualEditorPage from "./pages/VisualEditorPage";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";

function Router() {
  return <Switch><Route path="/" component={Home} /><Route path="/contracts/new" component={NewContractPage} /><Route path="/contracts/history" component={ContractHistoryPage} /><Route path="/contracts/active" component={OperationsPage} /><Route path="/contracts/overdue" component={OperationsPage} /><Route path="/contracts/suspended" component={OperationsPage} /><Route path="/contracts/:id" component={ContractDetailsPage} /><Route path="/vehicles" component={OperationsPage} /><Route path="/vehicles/:id" component={VehicleDetailsPage} /><Route path="/customers" component={CustomersPage} /><Route path="/blocked-customers" component={BlockedCustomersPage} /><Route path="/customers/:id" component={CustomerDetailsPage} /><Route path="/accounting" component={OperationsPage} /><Route path="/payments" component={ReferenceLedgerPage} /><Route path="/returns" component={ReferenceLedgerPage} /><Route path="/maintenance" component={OperationsPage} /><Route path="/reports" component={ReportsPage} /><Route path="/users" component={UsersPage} /><Route path="/editor" component={VisualEditorPage} /><Route path="/verify-email" component={VerifyEmailPage} /><Route path="/reset-password" component={ResetPasswordPage} /><Route path="/404" component={NotFound} /><Route component={NotFound} /></Switch>;
}

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster position="top-left" richColors /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>;
}
