const DAILY_BUDGET_LIMIT = 150;
        const STORAGE_DB = 'pukpik_db_v5';
        const STORAGE_OLD_DB = 'pukpik_db_v4';
        const STORAGE_CARDS = 'pukpik_cards';
        const STORAGE_CATEGORIES = 'pukpik_categories';

        let currentDate = new Date();
        let selectedDateKey = formatDateKey(new Date());
        let currentType = 'expense';
        let selectedPaymentSource = 'bank';
        let selectedTransferDirection = 'bank_to_cash';
        let selectedCategory = '';
        let editingTransactionId = null;
        let editingDateKey = null;

        const defaultCreditCards = ['เฟิร์สช้อยส์', 'อิออน M GEN'];
        const defaultCategories = {
            expense: [
                { id: 'food', name: 'อาหาร', icon: '🍜' },
                { id: 'necessity', name: 'ของใช้จำเป็น', icon: '🏡' },
                { id: 'travel', name: 'เดินทาง', icon: '🚗' },
                { id: 'shopping', name: 'ช้อปปิ้ง', icon: '🛍️' },
                { id: 'bill', name: 'บิล/เน็ต', icon: '📄' },
                { id: 'other_exp', name: 'อื่นๆ', icon: '✨' }
            ],
            income: [
                { id: 'salary', name: 'เงินเดือน', icon: '💼' },
                { id: 'pocket', name: 'เงินให้', icon: '👛' },
                { id: 'other_inc', name: 'อื่นๆ', icon: '🪙' }
            ]
        };

        let db = loadJSON(STORAGE_DB, null);
        if (!db) db = loadJSON(STORAGE_OLD_DB, {});
        let creditCards = loadJSON(STORAGE_CARDS, defaultCreditCards);
        let customCategories = loadJSON(STORAGE_CATEGORIES, defaultCategories);

        const monthNamesThai = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
        const $ = (id) => document.getElementById(id);
        const calendarGrid = $('calendarGrid');
        const weekdaysTemplate = ['อา','จ','อ','พ','พฤ','ศ','ส'];

        document.addEventListener('DOMContentLoaded', () => {
            normalizeData();
            initApp();
            setupEventListeners();
        });

        function loadJSON(key, fallback) {
            try {
                const raw = localStorage.getItem(key);
                return raw ? JSON.parse(raw) : fallback;
            } catch { return fallback; }
        }

        function saveAll() {
            localStorage.setItem(STORAGE_DB, JSON.stringify(db));
            localStorage.setItem(STORAGE_CARDS, JSON.stringify(creditCards));
            localStorage.setItem(STORAGE_CATEGORIES, JSON.stringify(customCategories));
        }

        function normalizeData() {
            if (!customCategories.expense) customCategories.expense = defaultCategories.expense;
            if (!customCategories.income) customCategories.income = defaultCategories.income;
            if (!Array.isArray(creditCards)) creditCards = [...defaultCreditCards];
            Object.keys(db || {}).forEach(dateKey => {
                if (!Array.isArray(db[dateKey])) delete db[dateKey];
                else db[dateKey] = db[dateKey].map(item => ({
                    id: item.id || Date.now() + Math.random(),
                    type: item.type || 'expense',
                    amount: Number(item.amount) || 0,
                    note: String(item.note || ''),
                    category: item.category || '',
                    time: item.time || '00:00',
                    skipBudget: Boolean(item.skipBudget),
                    source: item.source || 'bank',
                    transferDirection: item.transferDirection || ''
                })).filter(item => item.amount > 0);
            });
            saveAll();
        }

        function initApp() {
            renderCalendar();
            renderHistory(selectedDateKey);
            updateRealtimeDashboard();
            renderOverallAndCategorySummary();
        }

        function setupEventListeners() {
            $('openModalBtn').addEventListener('click', () => {
                resetForm();
                $('modalOverlay').classList.add('show');
                setTimeout(() => $('amountInput').focus(), 120);
            });
            $('closeModalBtn').addEventListener('click', closeModal);
            $('modalOverlay').addEventListener('click', (e) => { if (e.target.id === 'modalOverlay') closeModal(); });
            document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

            document.querySelectorAll('.type-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
                    e.currentTarget.classList.add('active');
                    currentType = e.currentTarget.dataset.type;
                    selectedPaymentSource = 'bank';
                    switchFormTypeElements();
                    renderFormCategories();
                });
            });
            $('saveTransactionBtn').addEventListener('click', handleSaveTransaction);
        }

        function closeModal() { $('modalOverlay').classList.remove('show'); }
        function escapeHTML(value) {
            return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
        }
        function money(value, min = 0) {
            return Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: min, maximumFractionDigits: 2 });
        }
        function parseDateKey(key) {
            const [y, m, d] = key.split('-').map(Number);
            return new Date(y, m - 1, d);
        }
        function formatDateKey(date) {
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        }
        function isSameMonthKey(dateKey, dateObj) {
            const d = parseDateKey(dateKey);
            return d.getFullYear() === dateObj.getFullYear() && d.getMonth() === dateObj.getMonth();
        }

        function renderWalletButtons() {
            const container = $('walletButtonsContainer');
            container.innerHTML = '';
            if (currentType === 'expense') {
                $('walletZoneLabel').innerText = 'จ่ายด้วยกระเป๋าหรือบัตรเครดิตไหน?';
                addWalletButton('🏦 บัญชีธนาคาร', 'bank');
                addWalletButton('💵 เงินสดในมือ', 'cash');
                creditCards.forEach(card => addWalletButton(`💳 ${card}`, `credit_${card}`, true));
                const addBtn = document.createElement('button');
                addBtn.type = 'button';
                addBtn.className = 'add-manage-btn';
                addBtn.innerText = '➕ เพิ่มบัตรเครดิต';
                addBtn.onclick = addNewCreditCard;
                container.appendChild(addBtn);
            } else if (currentType === 'income') {
                $('walletZoneLabel').innerText = 'รับเงินเข้ากระเป๋าไหน?';
                addWalletButton('🏦 บัญชีธนาคาร', 'bank');
                addWalletButton('💵 เงินสดในมือ', 'cash');
            }
        }

        function addWalletButton(label, source, isCredit = false) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `wallet-select-btn ${isCredit ? 'credit-style' : ''} ${selectedPaymentSource === source ? 'active' : ''}`;
            btn.textContent = label;
            btn.onclick = () => { selectedPaymentSource = source; renderWalletButtons(); };
            $('walletButtonsContainer').appendChild(btn);
        }

        function addNewCreditCard() {
            const cardName = prompt('กรอกชื่อบัตรเครดิตใหม่ค๊าบ:');
            const clean = cardName ? cardName.trim() : '';
            if (!clean) return;
            if (creditCards.includes(clean)) return alert('มีชื่อบัตรใบนี้อยู่ในระบบแล้วค๊าบ 😮');
            creditCards.push(clean);
            selectedPaymentSource = `credit_${clean}`;
            saveAll();
            renderWalletButtons();
            renderOverallAndCategorySummary();
        }

        function addNewCategory() {
            if (currentType === 'transfer') return;
            const typeText = currentType === 'expense' ? 'รายจ่าย' : 'รายรับ';
            const catName = prompt(`กรอกชื่อหมวดหมู่${typeText}ใหม่ค๊าบ:`);
            const cleanName = catName ? catName.trim() : '';
            if (!cleanName) return;
            const catIcon = (prompt(`ส่งอิโมจิประจำหมวดหมู่ "${cleanName}" มาหน่อยค๊าบ:`) || '✨').trim().slice(0, 4);
            const newId = `custom_${currentType}_${Date.now()}`;
            customCategories[currentType].push({ id: newId, name: cleanName, icon: catIcon || '✨' });
            selectedCategory = newId;
            saveAll();
            renderFormCategories();
            renderOverallAndCategorySummary();
        }

        function selectTransferDirection(direction) {
            selectedTransferDirection = direction;
            $('transBankToCashBtn').classList.toggle('active', direction === 'bank_to_cash');
            $('transCashToBankBtn').classList.toggle('active', direction === 'cash_to_bank');
        }

        function switchFormTypeElements() {
            renderWalletButtons();
            $('walletSelectorZone').style.display = currentType === 'transfer' ? 'none' : 'block';
            $('transferDirectionZone').style.display = currentType === 'transfer' ? 'block' : 'none';
            $('categoryZone').style.display = currentType === 'transfer' ? 'none' : 'block';
            $('skipBudgetRow').style.display = currentType === 'expense' ? 'flex' : 'none';
        }

        function getDaySummary(dateKey) {
            const list = db[dateKey] || [];
            let income = 0, expense = 0, budgetAffectingExpense = 0;
            list.forEach(item => {
                const amount = Number(item.amount) || 0;
                if (item.type === 'income') income += amount;
                if (item.type === 'expense') {
                    expense += amount;
                    const isCredit = String(item.source || '').startsWith('credit_');
                    if (!item.skipBudget && !isCredit) budgetAffectingExpense += amount;
                }
            });
            return { income, expense, budgetAffectingExpense, balance: DAILY_BUDGET_LIMIT - budgetAffectingExpense };
        }

        function updateRealtimeDashboard() {
            const summary = getDaySummary(formatDateKey(new Date()));
            const remaining = summary.balance;
            $('dailyRemaining').innerText = money(Math.abs(remaining), 2);
            const badge = $('budgetBadgeColor');
            badge.className = 'banner-budget-badge';
            if (remaining >= 70) {
                $('budgetText').innerText = 'งบวันนี้เหลือ';
                $('mascotEmoji').innerText = '🐻';
                $('mascotSpeech').innerText = 'เก่งมาก ประหยัดสุดๆ!';
            } else if (remaining > 0) {
                badge.classList.add('warning');
                $('budgetText').innerText = 'งบเริ่มเหลือน้อย';
                $('mascotEmoji').innerText = '🐹';
                $('mascotSpeech').innerText = 'เริ่มแห้งแล้งแล้วนะน้า!';
            } else {
                badge.classList.add('danger');
                $('budgetText').innerText = 'วันนี้ใช้เกินงบไป';
                $('mascotEmoji').innerText = '🐼';
                $('mascotSpeech').innerText = 'พรุ่งนี้เอาใหม่ได้ค๊าบ';
            }
        }

        function renderOverallAndCategorySummary() {
            let monthIncome = 0, monthExpense = 0, monthCredit = 0;
            let bankBalance = 0, cashBalance = 0;
            const catTotals = {};
            const cardBreakdownTotals = {};
            creditCards.forEach(c => cardBreakdownTotals[c] = 0);

            Object.keys(db).forEach(dateKey => {
                const inCurrentMonth = isSameMonthKey(dateKey, currentDate);
                (db[dateKey] || []).forEach(item => {
                    const amount = Number(item.amount) || 0;
                    const source = item.source || 'bank';
                    if (item.type === 'income') {
                        if (source === 'bank') bankBalance += amount;
                        if (source === 'cash') cashBalance += amount;
                        if (inCurrentMonth) monthIncome += amount;
                    } else if (item.type === 'expense') {
                        if (source.startsWith('credit_')) {
                            const cardName = source.replace('credit_', '');
                            if (inCurrentMonth) {
                                monthCredit += amount;
                                cardBreakdownTotals[cardName] = (cardBreakdownTotals[cardName] || 0) + amount;
                            }
                        } else {
                            if (source === 'bank') bankBalance -= amount;
                            if (source === 'cash') cashBalance -= amount;
                        }
                        if (inCurrentMonth) {
                            monthExpense += amount;
                            catTotals[item.category] = (catTotals[item.category] || 0) + amount;
                        }
                    } else if (item.type === 'transfer') {
                        if ((item.transferDirection || 'bank_to_cash') === 'bank_to_cash') {
                            bankBalance -= amount; cashBalance += amount;
                        } else {
                            cashBalance -= amount; bankBalance += amount;
                        }
                    }
                });
            });

            $('totalIncomeText').innerText = money(monthIncome);
            $('totalExpenseText').innerText = money(monthExpense);
            $('totalBankText').innerText = money(bankBalance, 2);
            $('totalCashText').innerText = money(cashBalance, 2);
            $('totalCombinedText').innerText = money(bankBalance + cashBalance, 2);
            $('totalCreditText').innerText = money(monthCredit, 2);

            const creditZone = $('creditCardsBreakdownZone');
            creditZone.innerHTML = '';
            let hasCardRecord = false;
            Object.entries(cardBreakdownTotals).forEach(([card, amt]) => {
                if (amt > 0) {
                    hasCardRecord = true;
                    const badge = document.createElement('div');
                    badge.className = 'credit-card-mini-badge';
                    badge.innerHTML = `<span>💳</span><span>${escapeHTML(card)}:</span><strong>${money(amt)} ฿</strong>`;
                    creditZone.appendChild(badge);
                }
            });
            if (!hasCardRecord) creditZone.innerHTML = '<div style="font-size:11px;color:var(--text-muted);padding:2px 4px">💳 ยังไม่มียอดรูดบัตรในเดือนนี้ค๊าบ</div>';

            const catZone = $('categorySummaryGrid');
            catZone.innerHTML = '';
            customCategories.expense.forEach(cat => {
                const box = document.createElement('div');
                box.className = 'cat-summary-mini-box';
                box.innerHTML = `<span>${escapeHTML(cat.icon)}</span><span>${escapeHTML(cat.name)}:</span><strong>${Math.round(catTotals[cat.id] || 0)} ฿</strong>`;
                catZone.appendChild(box);
            });
        }

        function renderCalendar() {
            calendarGrid.innerHTML = weekdaysTemplate.map(w => `<div class="weekday">${w}</div>`).join('');
            const year = currentDate.getFullYear();
            const month = currentDate.getMonth();
            $('calendarMonthYear').innerText = `${monthNamesThai[month]} ${year + 543}`;
            const firstDayIndex = new Date(year, month, 1).getDay();
            const totalDays = new Date(year, month + 1, 0).getDate();
            for (let i = 0; i < firstDayIndex; i++) calendarGrid.appendChild(document.createElement('div'));
            const todayKey = formatDateKey(new Date());
            for (let day = 1; day <= totalDays; day++) {
                const cellKey = formatDateKey(new Date(year, month, day));
                const summary = getDaySummary(cellKey);
                const cell = document.createElement('button');
                cell.type = 'button';
                cell.className = 'day-cell';
                if (cellKey === todayKey) cell.classList.add('today');
                if (cellKey === selectedDateKey) cell.classList.add('selected');
                cell.onclick = () => { selectedDateKey = cellKey; renderCalendar(); renderHistory(cellKey); };
                cell.innerHTML = `<span class="day-number">${day}</span>`;
                if (summary.expense > 0) {
                    let status = summary.budgetAffectingExpense <= 75 ? 'status-safe' : (summary.budgetAffectingExpense <= DAILY_BUDGET_LIMIT ? 'status-warn' : 'status-over');
                    const amt = document.createElement('span');
                    amt.className = `day-amount ${status}`;
                    amt.innerText = `-${Math.round(summary.expense)}`;
                    cell.appendChild(amt);
                }
                calendarGrid.appendChild(cell);
            }
        }

        function changeMonth(direction) {
            currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + direction, 1);
            renderCalendar();
            renderOverallAndCategorySummary();
        }
        function goToday() {
            currentDate = new Date();
            selectedDateKey = formatDateKey(new Date());
            initApp();
        }

        function renderHistory(dateKey) {
            const items = db[dateKey] || [];
            const summary = getDaySummary(dateKey);
            const d = parseDateKey(dateKey);
            $('historyTitle').innerText = `รายการวันที่ ${d.getDate()} ${monthNamesThai[d.getMonth()]}`;
            $('dayTotalExpense').innerText = `ใช้ไป: ${money(summary.expense, 2)} ฿`;
            const list = $('historyList');
            list.innerHTML = '';
            if (items.length === 0) {
                list.innerHTML = '<div class="empty-state">ยังไม่มีรายการของวันนี้ค๊าบ 📭</div>';
                return;
            }
            [...items].reverse().forEach(item => {
                const allCats = [...customCategories.expense, ...customCategories.income];
                let icon = '✨', catName = 'ทั่วไป';
                if (item.type === 'transfer') {
                    icon = '🔁';
                    catName = item.transferDirection === 'bank_to_cash' ? 'ถอนเงินสด' : 'ฝากเงินเข้าบัญชี';
                } else {
                    const catObj = allCats.find(c => c.id === item.category);
                    if (catObj) { icon = catObj.icon; catName = catObj.name; }
                }
                let labels = '';
                if (item.type === 'expense' && item.skipBudget) labels += '<span class="item-skip-label">⚠️ จำเป็นพิเศษ ไม่คิดงบ 150</span>';
                const src = item.source || 'bank';
                if (src.startsWith('credit_')) labels += `<span class="item-credit-label">💳 บัตร: ${escapeHTML(src.replace('credit_', ''))}</span>`;
                else if (item.type !== 'transfer') labels += `<span class="item-wallet-label">📦 ผ่าน: ${src === 'cash' ? '💵 เงินสด' : '🏦 บัญชี'}</span>`;
                const sign = item.type === 'income' ? '+' : (item.type === 'transfer' ? '🔁 ' : '-');
                const amountClass = item.type === 'transfer' ? 'transfer' : item.type;
                const bg = item.type === 'income' ? 'var(--success)' : (item.type === 'expense' ? 'var(--primary)' : 'var(--accent-blue)');
                const itemEl = document.createElement('div');
                itemEl.className = 'history-item';
                itemEl.innerHTML = `
                    <div class="item-icon" style="background-color:${bg}">${escapeHTML(icon)}</div>
                    <div class="item-info">
                        <div class="item-title">${escapeHTML(item.note || catName)}</div>
                        <div class="item-time">${escapeHTML(item.time)} | ${escapeHTML(catName)}</div>
                    </div>
                    <div class="item-amount ${amountClass}">${sign}${money(item.amount, 2)} ฿${labels}</div>
                    <div class="item-actions-wrapper">
                        <button type="button" class="item-action-mini-btn" title="แก้ไข" onclick="editTransaction('${dateKey}', ${Number(item.id)})">✏️</button>
                        <button type="button" class="item-action-mini-btn delete" title="ลบ" onclick="deleteTransaction('${dateKey}', ${Number(item.id)})">❌</button>
                    </div>`;
                list.appendChild(itemEl);
            });
        }

        function renderFormCategories() {
            const grid = $('formCategoryGrid');
            grid.innerHTML = '';
            const list = customCategories[currentType] || [];
            if (!list.length) return;
            if (!list.some(c => c.id === selectedCategory)) selectedCategory = list[0].id;
            list.forEach(cat => {
                const el = document.createElement('div');
                el.className = `cat-item ${cat.id === selectedCategory ? 'selected' : ''}`;
                el.onclick = () => { selectedCategory = cat.id; renderFormCategories(); };
                el.innerHTML = `<div class="cat-icon">${escapeHTML(cat.icon)}</div><div class="cat-name">${escapeHTML(cat.name)}</div>`;
                grid.appendChild(el);
            });
        }

        function resetForm() {
            editingTransactionId = null;
            editingDateKey = null;
            $('modalTitle').innerText = 'เพิ่มรายการปุกปิก 🥑';
            $('saveTransactionBtn').innerText = 'บันทึกเลย! ✨';
            $('amountInput').value = '';
            $('noteInput').value = '';
            $('skipBudgetCheck').checked = false;
            currentType = 'expense';
            selectedPaymentSource = 'bank';
            selectedTransferDirection = 'bank_to_cash';
            document.querySelectorAll('.type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === 'expense'));
            selectTransferDirection('bank_to_cash');
            switchFormTypeElements();
            selectedCategory = customCategories.expense?.[0]?.id || '';
            renderFormCategories();
        }

        function setTypeButtonActive(type) {
            document.querySelectorAll('.type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === type));
        }

        function editTransaction(dateKey, transactionId) {
            const item = (db[dateKey] || []).find(x => Number(x.id) === Number(transactionId));
            if (!item) return alert('ไม่พบรายการนี้แล้วค๊าบ');

            editingTransactionId = transactionId;
            editingDateKey = dateKey;
            currentType = item.type || 'expense';
            selectedPaymentSource = item.source || 'bank';
            selectedTransferDirection = item.transferDirection || 'bank_to_cash';
            selectedCategory = item.category || '';

            $('amountInput').value = item.amount;
            $('noteInput').value = item.note || '';
            $('skipBudgetCheck').checked = Boolean(item.skipBudget);
            $('modalTitle').innerText = 'แก้ไขรายการปุกปิก ✏️';
            $('saveTransactionBtn').innerText = '💾 บันทึกการแก้ไข';

            setTypeButtonActive(currentType);
            selectTransferDirection(selectedTransferDirection);
            switchFormTypeElements();
            renderFormCategories();
            $('modalOverlay').classList.add('show');
            setTimeout(() => $('amountInput').focus(), 120);
        }

        function buildTransactionPayload(amount, note, existing = {}) {
            const now = new Date();
            const timeStr = existing.time || `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            return {
                ...existing,
                type: currentType,
                amount: Math.round(amount * 100) / 100,
                note,
                category: currentType !== 'transfer' ? selectedCategory : '',
                time: timeStr,
                skipBudget: currentType === 'expense' ? $('skipBudgetCheck').checked : false,
                source: currentType !== 'transfer' ? selectedPaymentSource : '',
                transferDirection: currentType === 'transfer' ? selectedTransferDirection : ''
            };
        }

        function handleSaveTransaction() {
            const amount = Number($('amountInput').value);
            const note = $('noteInput').value.trim();
            if (!Number.isFinite(amount) || amount <= 0) return alert('กรุณากรอกจำนวนเงินให้ถูกต้องน้า 🥺');

            if (editingTransactionId !== null && editingDateKey !== null) {
                const list = db[editingDateKey] || [];
                const index = list.findIndex(item => Number(item.id) === Number(editingTransactionId));
                if (index === -1) return alert('ไม่พบรายการเดิมสำหรับแก้ไขค๊าบ');
                list[index] = buildTransactionPayload(amount, note, list[index]);
                db[editingDateKey] = list;
                saveAll();
                closeModal();
                editingTransactionId = null;
                editingDateKey = null;
                initApp();
                return;
            }

            if (!db[selectedDateKey]) db[selectedDateKey] = [];
            db[selectedDateKey].push(buildTransactionPayload(amount, note, { id: Date.now() }));
            saveAll();
            closeModal();
            initApp();
        }

        function deleteTransaction(dateKey, transactionId) {
            if (!db[dateKey]) return;
            if (!confirm('ต้องการลบรายการนี้ใช่ไหมค๊าบ? 🥺')) return;
            db[dateKey] = db[dateKey].filter(item => Number(item.id) !== Number(transactionId));
            if (db[dateKey].length === 0) delete db[dateKey];
            saveAll();
            initApp();
        }

        function backupData() {
            const payload = {
                app: 'PukPik Pocket',
                version: '5.1',
                exportedAt: new Date().toISOString(),
                db,
                creditCards,
                customCategories,
                dailyBudgetLimit: DAILY_BUDGET_LIMIT
            };
            const dataBlob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const now = new Date();
            const fileName = `pukpik_pocket_backup_${formatDateKey(now)}.json`;
            const link = document.createElement('a');
            link.href = URL.createObjectURL(dataBlob);
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            URL.revokeObjectURL(link.href);
            link.remove();
        }

        function triggerRestore() { $('restoreFileInput').click(); }

        function restoreData(event) {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const imported = JSON.parse(e.target.result);
                    const nextDb = imported.db || imported;
                    if (!nextDb || typeof nextDb !== 'object' || Array.isArray(nextDb)) throw new Error('Invalid data');
                    if (!confirm('การดึงคืนข้อมูลจะเขียนทับข้อมูลทั้งหมดตอนนี้ ต้องการทำต่อไหมค๊าบ? ⚠️')) return;
                    db = nextDb;
                    if (Array.isArray(imported.creditCards)) creditCards = imported.creditCards;
                    if (imported.customCategories && typeof imported.customCategories === 'object') customCategories = imported.customCategories;
                    normalizeData();
                    initApp();
                    alert('ดึงคืนข้อมูลสำเร็จแล้วค๊าบ! ✨');
                } catch {
                    alert('ไฟล์ไม่ถูกต้อง กรุณาใช้ไฟล์สำรองของ PukPik Pocket เท่านั้นค๊าบ ❌');
                } finally {
                    event.target.value = '';
                }
            };
            reader.readAsText(file);
        }
