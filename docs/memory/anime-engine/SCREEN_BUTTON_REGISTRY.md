# Anime Engine Screen & Button Registry (Auto-Generated)

Generated from source. Screens: 34.

## Screen Index
| Screen ID | File | Route (approx) |
|---|---|---|
| S01 | BudgetLedgerScreen.kt | TBD |
| S02 | CanonViewerScreen.kt | TBD |
| S03 | CharacterDeepDiveScreen.kt | TBD |
| S04 | ContinuityCheckerScreen.kt | TBD |
| S05 | JobsMonitorScreen.kt | TBD |
| S06 | LoreExplorerScreen.kt | TBD |
| S07 | QuotaDashboardScreen.kt | TBD |
| S08 | VisionAnalysisScreen.kt | TBD |
| S09 | AnalyticsScreen.kt | TBD |
| S10 | AuthScreen.kt | TBD |
| S11 | AIBrainScreen.kt | TBD |
| S12 | CharacterDetailScreen.kt | TBD |
| S13 | CharacterListScreen.kt | TBD |
| S14 | EpisodePlannerScreen.kt | TBD |
| S15 | MediaLibraryScreen.kt | TBD |
| S16 | NotificationScreen.kt | TBD |
| S17 | AdminQueuesScreen.kt | TBD |
| S18 | AuditLogScreen.kt | TBD |
| S19 | DatabaseScreen.kt | TBD |
| S20 | OwnerOverviewScreen.kt | TBD |
| S21 | WorkerManagerScreen.kt | TBD |
| S22 | WorkflowManagerScreen.kt | TBD |
| S23 | PreflightScreen.kt | TBD |
| S24 | ProductionScreen.kt | TBD |
| S25 | SceneDetailScreen.kt | TBD |
| S26 | BibleScreen.kt | TBD |
| S27 | ProjectDetailScreen.kt | TBD |
| S28 | PublishScreen.kt | TBD |
| S29 | QCScreen.kt | TBD |
| S30 | ReviewInboxScreen.kt | TBD |
| S31 | SettingsScreen.kt | TBD |
| S32 | PromptStudioScreen.kt | TBD |
| S33 | StudioDashboardScreen.kt | TBD |
| S34 | QuickToolsScreen.kt | TBD |

## Interactive Actions by Screen
### S01 — BudgetLedgerScreen.kt
- A01-001 (line 102): `PrimaryButton(`
- A01-002 (line 105): `onClick = {`

### S02 — CanonViewerScreen.kt
- A02-001 (line 89): `Button(`
- A02-002 (line 90): `onClick = {`
- A02-003 (line 108): `TextButton(onClick = { showAddFactDialog = false }) { Text("Cancel") }`
- A02-004 (line 116): `ExtendedFloatingActionButton(`
- A02-005 (line 117): `onClick = { showAddFactDialog = true },`
- A02-006 (line 140): `Button(onClick = {`
- A02-007 (line 155): `Tab(selected = selectedTab == 0, onClick = { selectedTab = 0 }, text = { Text("Locked Facts") })`
- A02-008 (line 156): `Tab(selected = selectedTab == 1, onClick = { selectedTab = 1 }, text = { Text("Pending Proposals") })`
- A02-009 (line 174): `onClick = { selectedFilter = chip },`
- A02-010 (line 298): `Button(`
- A02-011 (line 299): `onClick = {`
- A02-012 (line 316): `OutlinedButton(`
- A02-013 (line 317): `onClick = {`

### S03 — CharacterDeepDiveScreen.kt
- A03-001 (line 145): `OutlinedButton(onClick = { charDropdownExpanded = true }, modifier = Modifier.fillMaxWidth()) {`
- A03-002 (line 152): `onClick = {`
- A03-003 (line 162): `Button(onClick = {`
- A03-004 (line 181): `onClick = {`

### S04 — ContinuityCheckerScreen.kt
- A04-001 (line 72): `OutlinedButton(onClick = { scopeExpanded = true }) {`
- A04-002 (line 79): `onClick = {`
- A04-003 (line 90): `Button(`
- A04-004 (line 91): `onClick = {`
- A04-005 (line 129): `onClick = { selectedFilter = f },`
- A04-006 (line 206): `Button(`
- A04-007 (line 207): `onClick = {`

### S05 — JobsMonitorScreen.kt
- A05-001 (line 8): `import androidx.compose.foundation.clickable`
- A05-002 (line 105): `Tab(selected = selectedTab == 0, onClick = { selectedTab = 0 }, text = { Text("Active Jobs") })`
- A05-003 (line 106): `Tab(selected = selectedTab == 1, onClick = { selectedTab = 1 }, text = { Text("Retries") })`
- A05-004 (line 128): `.clickable {`
- A05-005 (line 175): `onClick = {},`
- A05-006 (line 184): `OutlinedButton(`
- A05-007 (line 185): `onClick = {`
- A05-008 (line 242): `OutlinedButton(`
- A05-009 (line 243): `onClick = {`

### S06 — LoreExplorerScreen.kt
- A06-001 (line 82): `Button(`
- A06-002 (line 83): `onClick = {`
- A06-003 (line 101): `TextButton(onClick = { showAddDialog = false }) { Text("Cancel") }`
- A06-004 (line 109): `ExtendedFloatingActionButton(`
- A06-005 (line 110): `onClick = { showAddDialog = true },`
- A06-006 (line 129): `OutlinedButton(onClick = { showAddDialog = true }) {`
- A06-007 (line 151): `onClick = { selectedIndex = idx },`
- A06-008 (line 169): `Button(onClick = { showAddDialog = true }) {`

### S07 — QuotaDashboardScreen.kt
- None detected

### S08 — VisionAnalysisScreen.kt
- A08-001 (line 111): `onClick = { mode = "QUICK" },`
- A08-002 (line 116): `onClick = { mode = "SAVE" },`
- A08-003 (line 145): `PrimaryButton(`
- A08-004 (line 149): `onClick = {`

### S09 — AnalyticsScreen.kt
- A09-001 (line 71): `onClick = { dateRange = key },`

### S10 — AuthScreen.kt
- A10-001 (line 116): `TextButton(onClick = { isPasswordVisible = !isPasswordVisible }) {`
- A10-002 (line 137): `Button(`
- A10-003 (line 138): `onClick = { viewModel.login(email, password) },`
- A10-004 (line 153): `TextButton(onClick = {`
- A10-005 (line 158): `TextButton(onClick = {`

### S11 — AIBrainScreen.kt
- A11-001 (line 157): `IconButton(onClick = {`
- A11-002 (line 195): `onClick = { sendMessage(chipText) },`
- A11-003 (line 244): `Button(`
- A11-004 (line 245): `onClick = {`
- A11-005 (line 284): `IconButton(`
- A11-006 (line 285): `onClick = { sendMessage(inputPrompt) },`

### S12 — CharacterDetailScreen.kt
- A12-001 (line 66): `OutlinedButton(onClick = { providerExpanded = true }, modifier = Modifier.fillMaxWidth()) {`
- A12-002 (line 73): `onClick = {`
- A12-003 (line 83): `OutlinedButton(onClick = { voiceExpanded = true }, modifier = Modifier.fillMaxWidth()) {`
- A12-004 (line 90): `onClick = {`
- A12-005 (line 100): `OutlinedButton(`
- A12-006 (line 101): `onClick = {`
- A12-007 (line 112): `Button(`
- A12-008 (line 113): `onClick = {`
- A12-009 (line 126): `Button(onClick = onOpenDeepDive, modifier = Modifier.fillMaxWidth()) {`

### S13 — CharacterListScreen.kt
- A13-001 (line 9): `import androidx.compose.foundation.clickable`
- A13-002 (line 84): `Button(`
- A13-003 (line 85): `onClick = {`
- A13-004 (line 97): `TextButton(onClick = { showAddDialog = false }) { Text("Cancel") }`
- A13-005 (line 123): `onClick = { selectedFilter = chip },`
- A13-006 (line 141): `Button(onClick = {`
- A13-007 (line 150): `OutlinedButton(onClick = { showAddDialog = true }) {`
- A13-008 (line 177): `TextButton(onClick = { showAddDialog = true }) {`
- A13-009 (line 194): `modifier = Modifier.fillMaxWidth().clickable { onCharacterClick(character) },`
- A13-010 (line 230): `IconButton(onClick = {`
- A13-011 (line 237): `TextButton(onClick = { onOpenDeepDive(character.id) }) {`

### S14 — EpisodePlannerScreen.kt
- A14-001 (line 203): `onClick = {`
- A14-002 (line 212): `SecondaryButton(`
- A14-003 (line 214): `onClick = { onOpenScenes(selectedEpNo) }`
- A14-004 (line 243): `onClick = {`
- A14-005 (line 251): `onClick = {`
- A14-006 (line 270): `TextButton(onClick = { showPromptPreview = !showPromptPreview }) {`
- A14-007 (line 314): `PrimaryButton(`
- A14-008 (line 317): `onClick = {`
- A14-009 (line 356): `PrimaryButton(`
- A14-010 (line 360): `onClick = { dispatchEpisodeGeneration(isRegeneration = false) },`
- A14-011 (line 363): `SecondaryButton(`
- A14-012 (line 366): `onClick = { showRegenerateConfirm = true },`

### S15 — MediaLibraryScreen.kt
- A15-001 (line 84): `onClick = { filterTab = tab },`
- A15-002 (line 170): `SecondaryButton(`
- A15-003 (line 172): `onClick = {`
- A15-004 (line 180): `PrimaryButton(`
- A15-005 (line 182): `onClick = { playingItem = item },`
- A15-006 (line 186): `PrimaryButton(`
- A15-007 (line 188): `onClick = {`

### S16 — NotificationScreen.kt
- A16-001 (line 8): `import androidx.compose.foundation.clickable`
- A16-002 (line 63): `TextButton(onClick = {`
- A16-003 (line 103): `.clickable { readIds[itemId] = true },`

### S17 — AdminQueuesScreen.kt
- A17-001 (line 7): `import androidx.compose.foundation.clickable`
- A17-002 (line 83): `InfoTooltipButton(`
- A17-003 (line 103): `onClick = { refreshIntervalSec = sec },`
- A17-004 (line 126): `modifier = Modifier.fillMaxWidth().clickable { selectedQueueTitle = "Transactional Outbox Queue" },`
- A17-005 (line 137): `modifier = Modifier.fillMaxWidth().clickable { selectedQueueTitle = "Running Pipeline Commands" },`
- A17-006 (line 148): `modifier = Modifier.fillMaxWidth().clickable { selectedQueueTitle = "Failed & Dead-Letter Queue" },`

### S18 — AuditLogScreen.kt
- None detected

### S19 — DatabaseScreen.kt
- A19-001 (line 136): `Button(`
- A19-002 (line 137): `onClick = {`

### S20 — OwnerOverviewScreen.kt
- A20-001 (line 90): `Button(`
- A20-002 (line 91): `onClick = {`
- A20-003 (line 103): `TextButton(`
- A20-004 (line 104): `onClick = { showEmergencyDialog = false },`
- A20-005 (line 190): `Button(`
- A20-006 (line 191): `onClick = { showEmergencyDialog = true },`

### S21 — WorkerManagerScreen.kt
- A21-001 (line 53): `SecondaryButton(text = "Refresh", onClick = { loadWorkers() })`

### S22 — WorkflowManagerScreen.kt
- A22-001 (line 77): `SecondaryButton(text = "Refresh", onClick = { loadWorkflowSummary() })`

### S23 — PreflightScreen.kt
- A23-001 (line 229): `SecondaryButton(text = "Retry", onClick = { viewModel.load(projectId) })`
- A23-002 (line 262): `SecondaryButton(`
- A23-003 (line 265): `onClick = { check.fixRoute?.let { onNavigate(it) } }`
- A23-004 (line 269): `SecondaryButton(`
- A23-005 (line 273): `onClick = {`
- A23-006 (line 315): `PrimaryButton(`
- A23-007 (line 320): `onClick = {`

### S24 — ProductionScreen.kt
- A24-001 (line 92): `onClick = {},`
- A24-002 (line 114): `Button(`
- A24-003 (line 115): `onClick = onViewVideoClick,`
- A24-004 (line 166): `OutlinedButton(`
- A24-005 (line 167): `onClick = { viewModel.pausePipeline() },`
- A24-006 (line 174): `OutlinedButton(`
- A24-007 (line 175): `onClick = { viewModel.cancelPipeline() },`
- A24-008 (line 185): `Button(`
- A24-009 (line 186): `onClick = { pollTrigger++ },`
- A24-010 (line 253): `OutlinedButton(`
- A24-011 (line 254): `onClick = onOpenSceneInspector,`
- A24-012 (line 259): `OutlinedButton(`
- A24-013 (line 260): `onClick = onOpenMediaLibrary,`

### S25 — SceneDetailScreen.kt
- A25-001 (line 87): `PrimaryButton(`
- A25-002 (line 90): `onClick = {`
- A25-003 (line 117): `TextButton(onClick = { editingScene = null }, enabled = !isSavingScene) {`
- A25-004 (line 161): `onClick = {`
- A25-005 (line 220): `OutlinedButton(`
- A25-006 (line 221): `onClick = {`
- A25-007 (line 233): `OutlinedButton(`
- A25-008 (line 234): `onClick = {`
- A25-009 (line 257): `TextButton(`
- A25-010 (line 258): `onClick = {`

### S26 — BibleScreen.kt
- A26-001 (line 238): `OutlinedButton(`
- A26-002 (line 240): `onClick = {`
- A26-003 (line 299): `onClick = { selectedTab = idx },`
- A26-004 (line 381): `PrimaryButton(`
- A26-005 (line 384): `onClick = {`
- A26-006 (line 413): `OutlinedButton(`
- A26-007 (line 414): `onClick = {`

### S27 — ProjectDetailScreen.kt
- A27-001 (line 8): `import androidx.compose.foundation.clickable`
- A27-002 (line 275): `SecondaryButton(`
- A27-003 (line 279): `onClick = { coverPicker.launch("image/*") }`
- A27-004 (line 289): `Button(`
- A27-005 (line 290): `onClick = {`
- A27-006 (line 301): `OutlinedButton(`
- A27-007 (line 302): `onClick = {`
- A27-008 (line 314): `OutlinedButton(`
- A27-009 (line 315): `onClick = {`
- A27-010 (line 333): `Button(`
- A27-011 (line 334): `onClick = { editMedium = medium; settingsDirty = true },`
- A27-012 (line 342): `OutlinedButton(`
- A27-013 (line 343): `onClick = { editMedium = medium; settingsDirty = true },`
- A27-014 (line 352): `OutlinedButton(`
- A27-015 (line 353): `onClick = {`
- A27-016 (line 381): `PrimaryButton(`
- A27-017 (line 386): `onClick = {`
- A27-018 (line 419): `TextButton(`
- A27-019 (line 420): `onClick = { showSettingsDialog = false },`
- A27-020 (line 450): `SecondaryButton(text = "Retry", onClick = { loadProjectOverviewData(repository.currentProjectId()) })`
- A27-021 (line 456): `.clickable(enabled = !isUploadingCover) { coverPicker.launch("image/*") }`
- A27-022 (line 470): `OutlinedButton(`
- A27-023 (line 471): `onClick = { coverPicker.launch("image/*") },`
- A27-024 (line 488): `IconButton(`
- A27-025 (line 489): `onClick = {`
- A27-026 (line 505): `StandardCard(modifier = Modifier.weight(1f), onClick = onOpenCanon) {`
- A27-027 (line 509): `StandardCard(modifier = Modifier.weight(1f), onClick = onOpenContinuity) {`
- A27-028 (line 516): `MetricCard(label = "Episodes", value = episodesCount, modifier = Modifier.weight(1f), onClick = onOpenEpisodes)`
- A27-029 (line 517): `MetricCard(label = "Scenes", value = scenesCount, modifier = Modifier.weight(1f), onClick = onOpenScenes)`
- A27-030 (line 518): `MetricCard(label = "Characters", value = charactersCount, modifier = Modifier.weight(1f), onClick = onOpenCharacters)`
- A27-031 (line 527): `onClick = onOpenJobsMonitor`
- A27-032 (line 534): `onClick = onOpenReviewInbox`
- A27-033 (line 541): `onClick = onOpenJobsMonitor`
- A27-034 (line 567): `OutlinedButton(`
- A27-035 (line 568): `onClick = action,`
- A27-036 (line 591): `modifier = Modifier.clickable { if (activePid.isNotBlank()) onOpenPreflight(activePid) }`
- A27-037 (line 602): `SecondaryButton(`
- A27-038 (line 604): `onClick = onOpenProduction,`
- A27-039 (line 620): `PrimaryButton(`
- A27-040 (line 623): `onClick = { if (activePid.isNotBlank()) onOpenPreflight(activePid) },`
- A27-041 (line 626): `SecondaryButton(`
- A27-042 (line 628): `onClick = { if (activePid.isNotBlank()) onOpenPreflight(activePid) },`

### S28 — PublishScreen.kt
- A28-001 (line 87): `OutlinedButton(onClick = { loadViralMetadata() }) {`
- A28-002 (line 106): `OutlinedButton(onClick = {`
- A28-003 (line 123): `OutlinedButton(onClick = {`
- A28-004 (line 169): `OutlinedButton(onClick = { visDropdown = true }) {`
- A28-005 (line 176): `onClick = {`
- A28-006 (line 191): `Button(`
- A28-007 (line 192): `onClick = {`

### S29 — QCScreen.kt
- A29-001 (line 100): `onClick = {`
- A29-002 (line 125): `SecondaryButton(`
- A29-003 (line 128): `onClick = {`
- A29-004 (line 145): `PrimaryButton(`
- A29-005 (line 148): `onClick = {`
- A29-006 (line 169): `PrimaryButton(`
- A29-007 (line 172): `onClick = onProceedToPublish,`

### S30 — ReviewInboxScreen.kt
- A30-001 (line 66): `Button(`
- A30-002 (line 67): `onClick = {`
- A30-003 (line 89): `TextButton(onClick = { rejectingApproval = null }) { Text("Cancel") }`
- A30-004 (line 140): `AssistChip(onClick = {}, label = { Text("⏱️ Expires in 14m", fontSize = 11.sp) })`
- A30-005 (line 168): `Button(`
- A30-006 (line 169): `onClick = {`
- A30-007 (line 187): `OutlinedButton(`
- A30-008 (line 188): `onClick = { rejectingApproval = item },`

### S31 — SettingsScreen.kt
- A31-001 (line 111): `Tab(selected = selectedTab == idx, onClick = { selectedTab = idx }, text = { Text(title) })`
- A31-002 (line 237): `SecondaryButton(`
- A31-003 (line 239): `onClick = {`
- A31-004 (line 257): `PrimaryButton(`
- A31-005 (line 261): `onClick = {`

### S32 — PromptStudioScreen.kt
- A32-001 (line 207): `onClick = {`
- A32-002 (line 228): `OutlinedButton(`
- A32-003 (line 229): `onClick = {`
- A32-004 (line 239): `onClick = { favoritesOnly = !favoritesOnly },`
- A32-005 (line 249): `OutlinedButton(`
- A32-006 (line 250): `onClick = {`
- A32-007 (line 259): `OutlinedButton(`
- A32-008 (line 260): `onClick = {`
- A32-009 (line 272): `onClick = { genreFilterEnabled = !genreFilterEnabled },`
- A32-010 (line 283): `OutlinedButton(`
- A32-011 (line 284): `onClick = { templateIndex = (templateIndex + 1) % genreTemplates.size },`
- A32-012 (line 289): `SecondaryButton(`
- A32-013 (line 291): `onClick = {`
- A32-014 (line 323): `OutlinedButton(`
- A32-015 (line 324): `onClick = { editModeByCat[currentCategory] = true },`
- A32-016 (line 372): `PrimaryButton(`
- A32-017 (line 376): `onClick = {`
- A32-018 (line 418): `SecondaryButton(`
- A32-019 (line 421): `onClick = {`
- A32-020 (line 429): `OutlinedButton(`
- A32-021 (line 430): `onClick = { showResetConfirm = true },`
- A32-022 (line 469): `onClick = {`
- A32-023 (line 499): `IconButton(`
- A32-024 (line 500): `onClick = {`
- A32-025 (line 515): `IconButton(onClick = {`

### S33 — StudioDashboardScreen.kt
- A33-001 (line 6): `import androidx.compose.foundation.clickable`
- A33-002 (line 7): `import androidx.compose.foundation.clickable`
- A33-003 (line 92): `onClick = {`
- A33-004 (line 107): `Button(`
- A33-005 (line 108): `onClick = {`
- A33-006 (line 119): `TextButton(onClick = { showCreateDialog = false }) { Text("Cancel") }`
- A33-007 (line 136): `Button(`
- A33-008 (line 137): `onClick = {`
- A33-009 (line 146): `TextButton(onClick = { projectPendingDelete = null }) { Text("Cancel") }`
- A33-010 (line 166): `modifier = Modifier.clickable { onOpenJobsMonitor() }`
- A33-011 (line 172): `Button(onClick = { showProdDialog = false }) { Text("Close") }`
- A33-012 (line 180): `ExtendedFloatingActionButton(`
- A33-013 (line 181): `onClick = { showCreateDialog = true },`
- A33-014 (line 204): `modifier = Modifier.weight(1f).clickable { showProdDialog = true },`
- A33-015 (line 221): `modifier = Modifier.weight(1f).clickable { onOpenReviews() },`
- A33-016 (line 245): `modifier = Modifier.width(220.dp).clickable { onOpenEpisodes() },`
- A33-017 (line 289): `IconButton(onClick = { viewModel.loadProjects() }) {`
- A33-018 (line 302): `modifier = Modifier.fillMaxWidth().testTag(TestTags.item(TestTags.Studio.PROJECT_ITEM_PREFIX, project.id)).clickable {`
- A33-019 (line 329): `IconButton(`
- A33-020 (line 330): `onClick = { projectPendingDelete = project },`

### S34 — QuickToolsScreen.kt
- A34-001 (line 97): `onClick = { mode = "IMAGE" },`
- A34-002 (line 102): `onClick = { mode = "VIDEO" },`
- A34-003 (line 132): `PrimaryButton(`
- A34-004 (line 136): `onClick = {`
- A34-005 (line 184): `DangerButton(`
- A34-006 (line 187): `onClick = {`
- A34-007 (line 215): `PrimaryButton(`
- A34-008 (line 217): `onClick = {`
