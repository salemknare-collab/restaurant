import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Dashboard from './pages/Dashboard';
import POS from './pages/POS';
import Login from './pages/Login';
import Hub from './pages/Hub';
import Customer from './pages/Customer';
import Kitchen from './pages/Kitchen';
import Driver from './pages/Driver';
import Orders from './pages/Orders';
import Settings from './pages/Settings';
import Inventory from './pages/Inventory';
import Customers from './pages/Customers';
import Employees from './pages/Employees';
import Transactions from './pages/Transactions';
import Finance from './pages/Finance';
import Branches from './pages/Branches';
import Costing from './pages/Costing';
import Reports from './pages/Reports';
import ChartOfAccounts from './pages/ChartOfAccounts';
import RawMaterials from './pages/RawMaterials';
import Purchases from './pages/Purchases';
import { ThemeProvider } from './context/ThemeContext';
import { SettingsProvider } from './context/SettingsContext';

function App() {
  return (
    <ThemeProvider>
      <SettingsProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Customer />} />
            <Route path="/login" element={<Login />} />
            <Route path="/hub" element={
              <ProtectedRoute requireEmployee={true}>
                <Hub />
              </ProtectedRoute>
            } />
          
          {/* Admin Routes */}
          <Route path="/admin" element={
            <ProtectedRoute requiredRoles={['admin', 'manager']} requiredPermissions={['inventory.view', 'inventory.edit', 'reports.view', 'settings.access', 'users.manage']}>
              <Layout />
            </ProtectedRoute>
          }>
            <Route index element={<Dashboard />} />
            <Route path="orders" element={<Orders />} />
            <Route path="inventory" element={<Inventory />} />
            <Route path="raw-materials" element={<RawMaterials />} />
            <Route path="purchases" element={<Purchases />} />
            <Route path="customers" element={<Customers />} />
            <Route path="employees" element={<Employees />} />
            <Route path="transactions" element={<Transactions />} />
            <Route path="finance" element={<Finance />} />
            <Route path="branches" element={<Branches />} />
            <Route path="costing" element={<Costing />} />
            <Route path="reports" element={<Reports />} />
            <Route path="chart-of-accounts" element={<ChartOfAccounts />} />
            <Route path="settings" element={<Settings />} />
          </Route>

          {/* Standalone App Modules */}
          <Route path="/pos" element={
            <ProtectedRoute requiredPermissions={['pos.access']}>
              <POS />
            </ProtectedRoute>
          } />
          <Route path="/kitchen" element={
            <ProtectedRoute requiredPermissions={['kitchen.access']}>
              <Kitchen />
            </ProtectedRoute>
          } />
          <Route path="/driver" element={
            <ProtectedRoute requiredRoles={['admin', 'manager', 'driver']}>
              <Driver />
            </ProtectedRoute>
          } />
          
          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      </SettingsProvider>
    </ThemeProvider>
  );
}

export default App;
