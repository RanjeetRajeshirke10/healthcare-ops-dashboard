import { Route, Routes } from 'react-router-dom'
import NavBar from './components/NavBar'
import OverviewPage from './pages/OverviewPage'
import PatientAccessPage from './pages/PatientAccessPage'
import ProviderProductivityPage from './pages/ProviderProductivityPage'
import AncillaryServicesPage from './pages/AncillaryServicesPage'
import DataQualityPage from './pages/DataQualityPage'
import { PAGE_BG } from './theme/brand'

export default function App() {
  return (
    <div className="flex min-h-screen" style={{ backgroundColor: PAGE_BG }}>
      <NavBar />
      <main className="flex flex-1">
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/patient-access" element={<PatientAccessPage />} />
          <Route path="/provider-productivity" element={<ProviderProductivityPage />} />
          <Route path="/ancillary-services" element={<AncillaryServicesPage />} />
          <Route path="/data-quality" element={<DataQualityPage />} />
        </Routes>
      </main>
    </div>
  )
}
