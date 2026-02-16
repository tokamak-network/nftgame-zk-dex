import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { HomePage } from "./pages/HomePage";
import { F1PrivateNFTPage } from "./pages/F1PrivateNFTPage";
import { F4LootBoxPage } from "./pages/F4LootBoxPage";
import { F5GamingItemTradePage } from "./pages/F5GamingItemTradePage";
import { F8CardDrawPage } from "./pages/F8CardDrawPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/f1-private-nft" element={<F1PrivateNFTPage />} />
          <Route path="/f4-loot-box" element={<F4LootBoxPage />} />
          <Route path="/f5-item-trade" element={<F5GamingItemTradePage />} />
          <Route path="/f8-card-draw" element={<F8CardDrawPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
