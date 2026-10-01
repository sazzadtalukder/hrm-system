# Phase 14 — Asset Management

The bounded MVP manages company-owned asset categories, inventory, employee custody, return, maintenance/lost/retired status, and append-only history. One active custody assignment per asset is enforced transactionally. Assignment and lifecycle operations use parent locking, optimistic workflow versions, company-scoped idempotency keys, transactional audit, and company-composite foreign keys.

Employees and managers receive own-scope read access only. Asset Administrators receive explicit inventory and custody permissions. System Administrator and HR roles receive no financial asset authority implicitly. Acquisition values use `DECIMAL(19,2)`, company currency, and are never used to mutate Payroll or accounting data.

Excluded: depreciation, procurement, vendors, inventory warehouses, maintenance work orders, barcode integration, accounting/GL, payroll recovery, physical deletion, and notifications.
