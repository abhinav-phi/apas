```
apas/
├── .gitignore
├── LICENSE
├── README.md
├── blockchain/
│   └── product-auth-chain/
│       ├── .github/
│       │   └── workflows/
│       │       └── test.yml
│       ├── .gitignore
│       ├── Makefile
│       ├── README.md
│       ├── foundry.lock
│       ├── foundry.toml
│       ├── script/
│       │   ├── DeployProductTracker.s.sol
│       │   └── DeployProductTrackerSepolia.s.sol
│       ├── src/
│       │   └── ProductTracker.sol
│       └── test/
│           └── ProductTracker.t.sol
├── components.json
├── eslint.config.js
├── index.html
├── package-lock.json
├── package.json
├── postcss.config.js
├── public/
│   └── apas.png
├── src/
│   ├── App.css
│   ├── App.tsx
│   ├── components/
│   │   ├── ErrorBoundary.tsx
│   │   ├── NavLink.tsx
│   │   ├── layout/
│   │   │   └── DashboardLayout.tsx
│   │   └── ui/
│   ├── contexts/
│   │   └── AuthContext.tsx
│   ├── hooks/
│   │   ├── use-mobile.tsx
│   │   └── use-toast.ts
│   ├── index.css
│   ├── integrations/
│   │   └── supabase/
│   │       ├── client.ts
│   │       └── types.ts
│   ├── lib/
│   │   ├── hash.ts
│   │   ├── supabase.ts
│   │   └── utils.ts
│   ├── main.tsx
│   ├── pages/
│   │   ├── Alerts.tsx
│   │   ├── Analytics.tsx
│   │   ├── AuditLogs.tsx
│   │   ├── Auth.tsx
│   │   ├── Batches.tsx
│   │   ├── Dashboard.tsx
│   │   ├── Index.tsx
│   │   ├── MyProducts.tsx
│   │   ├── NotFound.tsx
│   │   ├── Products.tsx
│   │   ├── QRCodes.tsx
│   │   ├── ScanUpdate.tsx
│   │   ├── SupplyChain.tsx
│   │   ├── SystemDesign.tsx
│   │   ├── Users.tsx
│   │   └── Verify.tsx
│   ├── test/
│   │   ├── example.test.ts
│   │   └── setup.ts
│   ├── vite-env.d.ts
    └── supabase/
        ├── config.toml
        └── migrations/
            ├── 20260325190429_0e3af905-3a3d-4136-9279-dd4633c0ea91.sql
            ├── 20260330100000_fix_all_columns.sql
            ├── 20260330100100_fix_batch_id.sql
            ├── 20260330100200_fix_duplicates.sql
            ├── 20260330100300_fix_rls_policies.sql
            └── 20260330100400_fix_role_and_rpc.sql
├── tailwind.config.ts
├── tsconfig.app.json
├── tsconfig.json
├── tsconfig.node.json
└── vite.config.ts
```