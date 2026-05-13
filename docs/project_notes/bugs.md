# Bug Log

## 2026-05-12 - Food Confirm/Edit/Discard UI Showed Ambiguous Already Read State

- **Issue**: On-device food card actions appeared to show generic `already read` behavior; confirm left the card and records as pending, discard did not clearly remove anything, and edit used a confusing input path.
- **Root Cause**: The mobile state model kept `activeFoodAnalysis` as a permanent object, initial demo record IDs were not aligned with the active card lifecycle, and the food portion editor shared keyboard behavior with the main chat composer.
- **Solution**: Made active food analysis nullable, synchronized confirm/edit/discard with records, removed the card on discard, hid the main composer while editing portion details, and added a lifecycle test.
- **Prevention**: Treat pending AI-generated records as explicit stateful objects with create/edit/confirm/discard lifecycle tests.

