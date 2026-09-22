# Accounting PDF test fixtures

These fixtures are sanitized regression evidence for Accounting Document Recognition.

`uber-july-native-poppler.*` is derived from the read-only July 2026 Uber statement
that exposed the label/value column-order defect. The source PDF itself is not committed,
reprocessed, rematerialized, or mutated. Merchant/address/document identifiers are replaced,
while the financial values needed for the regression are retained.

The bbox fixture models the observed source two-column relationship in Poppler
`-bbox-layout` shape and preserves the production flattened-text failure shape. Raw source
bytes were not copied into the workspace, so its coordinates are sanitized representative
geometry rather than a byte-for-byte capture of production Poppler output. Tests therefore
assert page/row/right-of-label semantics and financial results instead of exact floating-point
positions.
