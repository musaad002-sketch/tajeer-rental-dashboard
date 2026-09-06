import fs from "node:fs";

const homePath = new URL("../client/src/pages/Home.tsx", import.meta.url);
let home = fs.readFileSync(homePath, "utf8");

home = home.replace(/\n\s*<section aria-label="العقود الحالية"[\s\S]*?<\/section>\n\n\s*\{canCreateContract \? <NewContractInline \/> : null\}/, "\n\n    {canCreateContract ? <NewContractInline /> : null}");
home = home.replace(/\n\s*const \[query, setQuery\] = useState\(""\);/, "");
home = home.replace(/\n\s*const currentContracts = useMemo\(.*?\);/, "");
home = home.replace(/\n\s*const filtered = useMemo\(.*?\);/, "");
home = home.replace(/import \{ Input \} from "@\/components\/ui\/input";\n/, "");
home = home.replace('import { Link, useLocation } from "wouter";', 'import { useLocation } from "wouter";');
home = home.replace(/, Search(?=,| \})/, "");
fs.writeFileSync(homePath, home);

const financialPath = new URL("../client/src/components/FinancialExtras.tsx", import.meta.url);
let financial = fs.readFileSync(financialPath, "utf8");
financial = financial.replaceAll(" style={{display: 'none'}}", "");
fs.writeFileSync(financialPath, financial);

