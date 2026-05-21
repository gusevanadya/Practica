// ======================== ГЛОБАЛЬНОЕ СОСТОЯНИЕ ========================
let schema = {};                    // { tableName: [col1, col2, ...] }
let selectedTables = new Set();     // имена выбранных таблиц
let joins = [];                     // { leftTable, leftColumn, rightTable, rightColumn, joinType }
let selectedColumns = {};           // { "table.column": true }
let whereConditions = [];           // { columnFull, operator, valueType, value, valueColumn }
let groupByColumns = [];            // массив "table.column"
let enableGroupBy = false;
let aggregations = {};              // { "table.column": "COUNT" }
let orderBy = [];                   // { columnFull, direction }

// ======================== DOM ЭЛЕМЕНТЫ ========================
const schemaUpload = document.getElementById('schemaUpload');
const schemaMessage = document.getElementById('schemaMessage');
const tablesListContainer = document.getElementById('tablesListContainer');
const tablesCounter = document.getElementById('tablesCounter');
const selectedTablesSpan = document.getElementById('selectedTablesSpan');
const joinBlock = document.getElementById('joinBlock');
const joinsWrapper = document.getElementById('joinsWrapper');
const selectColumnsArea = document.getElementById('selectColumnsArea');
const whereList = document.getElementById('whereList');
const groupByCheckboxesArea = document.getElementById('groupByCheckboxesArea');
const aggregateSelectArea = document.getElementById('aggregateSelectArea');
const orderByList = document.getElementById('orderByList');
const sqlOutput = document.getElementById('sqlOutput');
const resetEverythingBtn = document.getElementById('resetEverythingBtn');
const addJoinBtn = document.getElementById('addJoinBtn');
const globalSelectAllBtn = document.getElementById('globalSelectAllBtn');
const addWhereBtn = document.getElementById('addWhereBtn');
const clearGroupByBtn = document.getElementById('clearGroupByBtn');
const enableGroupByToggle = document.getElementById('enableGroupByToggle');
const addOrderBtn = document.getElementById('addOrderBtn');
const generateSqlBtn = document.getElementById('generateSqlBtn');
const saveSqlBtn = document.getElementById('saveSqlBtn');

// ======================== УТИЛИТЫ ========================
function showMessage(text, isError = false) {
    schemaMessage.style.display = 'block';
    schemaMessage.innerHTML = text;
    schemaMessage.style.background = isError ? '#fee2e2' : '#e6f7e6';
    schemaMessage.style.borderLeftColor = isError ? '#dc2626' : '#10b981';
    setTimeout(() => {
        schemaMessage.style.display = 'none';
    }, 4000);
}

function escapeHtml(str) {
    return String(str).replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

function getAllColumnsFlat() {
    const cols = [];
    for (let tbl of selectedTables) {
        if (schema[tbl]) {
            schema[tbl].forEach(col => cols.push(`${tbl}.${col}`));
        }
    }
    return cols;
}

function isValidColumnFull(colFull) {
    const [tbl] = colFull.split('.');
    return selectedTables.has(tbl);
}

// Очистка всех зависимостей (кроме схемы)
function resetAllState() {
    selectedTables.clear();
    joins = [];
    selectedColumns = {};
    whereConditions = [];
    groupByColumns = [];
    enableGroupBy = false;
    enableGroupByToggle.checked = false;
    aggregations = {};
    orderBy = [];
    
    renderTablesChecklist();
    updateSelectedTablesUI();
    renderJoinsUI();
    renderSelectColumns();
    renderWhereConditions();
    renderGroupByAndAggregates();
    renderOrderBy();
    sqlOutput.value = '';
}

// Парсинг файла схемы
function parseSchemaFile(content) {
    const lines = content.split(/\r?\n/);
    const newSchema = {};
    for (let line of lines) {
        line = line.trim();
        if (line === "") continue;
        const parts = line.split('\t');
        if (parts.length < 2) {
            showMessage(`Некорректная строка: ${line.substring(0, 50)}`, true);
            continue;
        }
        const tableName = parts[0].trim();
        const columns = parts.slice(1).map(c => c.trim()).filter(c => c !== "");
        if (tableName && columns.length) {
            newSchema[tableName] = columns;
        }
    }
    if (Object.keys(newSchema).length === 0) {
        throw new Error("Не найдено ни одной корректной таблицы");
    }
    return newSchema;
}

function loadSchema(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const newSchema = parseSchemaFile(e.target.result);
            schema = newSchema;
            resetAllState();
            renderTablesChecklist();
            showMessage(`✅ Схема загружена: ${Object.keys(schema).length} таблиц`);
            tablesCounter.innerText = `${Object.keys(schema).length} таблиц`;
        } catch (err) {
            showMessage(`Ошибка: ${err.message}`, true);
            schema = {};
            renderTablesChecklist();
        }
    };
    reader.readAsText(file);
}

// ======================== ОТРИСОВКА КОМПОНЕНТОВ ========================

// 2. Список таблиц с чекбоксами
function renderTablesChecklist() {
    if (Object.keys(schema).length === 0) {
        tablesListContainer.innerHTML = '<i>Загрузите файл со схемой</i>';
        return;
    }
    let html = '';
    for (let tbl of Object.keys(schema)) {
        const checked = selectedTables.has(tbl) ? 'checked' : '';
        html += `<label><input type="checkbox" value="${escapeHtml(tbl)}" class="table-checkbox" ${checked}> ${escapeHtml(tbl)}</label>`;
    }
    tablesListContainer.innerHTML = html;
    
    document.querySelectorAll('.table-checkbox').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const table = e.target.value;
            if (e.target.checked) {
                selectedTables.add(table);
            } else {
                selectedTables.delete(table);
            }
            // Очищаем зависимости, ссылающиеся на удалённые таблицы
            joins = joins.filter(j => selectedTables.has(j.leftTable) && selectedTables.has(j.rightTable));
            whereConditions = whereConditions.filter(w => isValidColumnFull(w.columnFull) && 
                (w.valueType !== 'column' || isValidColumnFull(w.valueColumn)));
            orderBy = orderBy.filter(o => isValidColumnFull(o.columnFull));
            groupByColumns = groupByColumns.filter(col => isValidColumnFull(col));
            if (!enableGroupBy) groupByColumns = [];
            
            updateSelectedTablesUI();
            renderJoinsUI();
            renderSelectColumns();
            renderWhereConditions();
            renderGroupByAndAggregates();
            renderOrderBy();
            sqlOutput.value = '';
        });
    });
}

function updateSelectedTablesUI() {
    const list = Array.from(selectedTables);
    selectedTablesSpan.innerText = list.length ? list.join(', ') : '—';
    joinBlock.style.display = selectedTables.size >= 2 ? 'block' : 'none';
}

// 3. JOIN интерфейс (с подсказками и улучшениями)
function generateTableOptions(selectedVal) {
    return Array.from(selectedTables).map(t => `<option value="${t}" ${t === selectedVal ? 'selected' : ''}>${t}</option>`).join('');
}

function generateColumnOptions(table, selectedCol) {
    if (!table || !schema[table]) return '<option>—</option>';
    return schema[table].map(c => `<option value="${c}" ${c === selectedCol ? 'selected' : ''}>${c}</option>`).join('');
}

// Функция для получения подсказки по типу JOIN
function getJoinTypeHint(joinType) {
    const hints = {
        'INNER': '🎯 INNER JOIN: только совпадающие записи в обеих таблицах. Пример: найти заказы с информацией о клиенте (только где есть оба)',
        'LEFT': '⬅️ LEFT JOIN: ВСЕ записи из левой таблицы + совпадения из правой (NULL если нет). Пример: все клиенты + их заказы (даже если заказов нет)',
        'RIGHT': '➡️ RIGHT JOIN: ВСЕ записи из правой таблицы + совпадения из левой (NULL если нет). Пример: все заказы + информация о клиентах (даже если клиент удалён)',
        'FULL': '🔄 FULL JOIN: ВСЕ записи из обеих таблиц. Пример: полное объединение двух списков, даже без соответствий'
    };
    return hints[joinType] || hints['INNER'];
}

// Функция для обновления подсказок у элементов JOIN
function enhanceJoinSelectWithTooltips() {
    document.querySelectorAll('.join-type-select').forEach(select => {
        if (!select.hasAttribute('data-enhanced')) {
            select.setAttribute('data-enhanced', 'true');
            
            // Добавляем всплывающую подсказку к самому select
            select.title = getJoinTypeHint(select.value);
            
            select.addEventListener('change', function() {
                // При изменении типа JOIN обновляем подсказку
                const selectedValue = this.value;
                this.title = getJoinTypeHint(selectedValue);
                
                // Обновляем подсказку у родительского элемента join-item
                const joinItem = this.closest('.join-item');
                if (joinItem) {
                    joinItem.setAttribute('data-hint', getJoinTypeHint(selectedValue));
                }
            });
        }
    });
    
    // Добавляем подсказки для всех join-item
    document.querySelectorAll('.join-item').forEach(item => {
        const joinTypeSelect = item.querySelector('.join-type-select');
        if (joinTypeSelect && !item.hasAttribute('data-hint')) {
            item.setAttribute('data-hint', getJoinTypeHint(joinTypeSelect.value));
        }
    });
}

function renderJoinsUI() {
    if (selectedTables.size < 2) {
        joinsWrapper.innerHTML = '— выберите минимум 2 таблицы —';
        return;
    }
    if (joins.length === 0) {
        joinsWrapper.innerHTML = '<i>Нет условий JOIN. Добавьте связь.</i>';
        return;
    }
    
    let html = '';
    joins.forEach((j, idx) => {
        const joinHint = getJoinTypeHint(j.joinType);
        
        html += `<div class="join-item" data-hint="${escapeHtml(joinHint)}">
                    <div class="join-field-group">
                        <label class="join-field-label">Левая таблица</label>
                        <select data-join-idx="${idx}" data-field="leftTable" class="join-table-select">
                            ${generateTableOptions(j.leftTable)}
                        </select>
                    </div>
                    <div class="join-field-group">
                        <label class="join-field-label">Столбец</label>
                        <select data-join-idx="${idx}" data-field="leftColumn" class="join-column-select">
                            ${generateColumnOptions(j.leftTable, j.leftColumn)}
                        </select>
                    </div>
                    
                    <div class="join-type-container">
                        <select data-join-idx="${idx}" data-field="joinType" class="join-type-select">
                            <option value="INNER" ${j.joinType === 'INNER' ? 'selected' : ''}>🔗 INNER JOIN</option>
                            <option value="LEFT" ${j.joinType === 'LEFT' ? 'selected' : ''}>⬅️ LEFT JOIN</option>
                            <option value="RIGHT" ${j.joinType === 'RIGHT' ? 'selected' : ''}>➡️ RIGHT JOIN</option>
                            <option value="FULL" ${j.joinType === 'FULL' ? 'selected' : ''}>🔄 FULL JOIN</option>
                        </select>
                    </div>
                    
                    <div class="join-field-group">
                        <label class="join-field-label">Правая таблица</label>
                        <select data-join-idx="${idx}" data-field="rightTable" class="join-table-select">
                            ${generateTableOptions(j.rightTable)}
                        </select>
                    </div>
                    <div class="join-field-group">
                        <label class="join-field-label">Столбец</label>
                        <select data-join-idx="${idx}" data-field="rightColumn" class="join-column-select">
                            ${generateColumnOptions(j.rightTable, j.rightColumn)}
                        </select>
                    </div>
                    
                    <button class="danger small-icon" data-remove-join="${idx}" title="Удалить условие JOIN">✖</button>
                 </div>`;
    });
    joinsWrapper.innerHTML = html;
    
    // Привязываем события
    document.querySelectorAll('[data-join-idx]').forEach(el => {
        const idx = parseInt(el.dataset.joinIdx);
        if (el.dataset.field) {
            el.addEventListener('change', (e) => {
                joins[idx][el.dataset.field] = e.target.value;
                renderJoinsUI();
                renderSelectColumns();
                renderGroupByAndAggregates();
            });
        }
    });
    
    document.querySelectorAll('[data-remove-join]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(btn.dataset.removeJoin);
            joins.splice(idx, 1);
            renderJoinsUI();
            renderSelectColumns();
            renderGroupByAndAggregates();
        });
    });
    
    // Добавляем улучшенные подсказки
    enhanceJoinSelectWithTooltips();
}

// 4. Выбор столбцов SELECT
function renderSelectColumns() {
    if (selectedTables.size === 0) {
        selectColumnsArea.innerHTML = '— нет выбранных таблиц —';
        return;
    }
    let html = '';
    for (let tbl of selectedTables) {
        const cols = schema[tbl] || [];
        html += `<div class="table-col-group">
                    <h4>📌 ${escapeHtml(tbl)}</h4>
                    <div class="checkbox-grid">`;
        cols.forEach(col => {
            const colFull = `${tbl}.${col}`;
            const isChecked = selectedColumns[colFull] === true;
            html += `<label><input type="checkbox" class="col-checkbox" data-col="${colFull}" ${isChecked ? 'checked' : ''}> ${col}</label>`;
        });
        html += `</div><button class="small-icon select-all-table" data-table="${tbl}">✔ Выбрать все ${tbl}</button></div>`;
    }
    selectColumnsArea.innerHTML = html;
    
    document.querySelectorAll('.col-checkbox').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const colFull = cb.dataset.col;
            if (cb.checked) {
                selectedColumns[colFull] = true;
            } else {
                delete selectedColumns[colFull];
            }
            renderGroupByAndAggregates();
            sqlOutput.value = '';
        });
    });
    document.querySelectorAll('.select-all-table').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const table = btn.dataset.table;
            schema[table].forEach(col => {
                selectedColumns[`${table}.${col}`] = true;
            });
            renderSelectColumns();
            renderGroupByAndAggregates();
        });
    });
}

// 5. WHERE условия (с поддержкой сравнения столбцов)
function renderWhereConditions() {
    if (selectedTables.size === 0) {
        whereList.innerHTML = '— нет таблиц —';
        return;
    }
    const allCols = getAllColumnsFlat();
    if (whereConditions.length === 0) {
        whereList.innerHTML = '<i>Нет условий WHERE. Добавьте фильтр.</i>';
        return;
    }
    let html = '';
    whereConditions.forEach((w, idx) => {
        const valueType = w.valueType || 'constant';
        html += `<div class="where-item">
                    <select data-where-idx="${idx}" data-field="column" style="min-width: 160px;">
                        ${allCols.map(c => `<option value="${c}" ${c === w.columnFull ? 'selected' : ''}>${c}</option>`).join('')}
                    </select>
                    <select data-where-idx="${idx}" data-field="operator" style="min-width: 80px;">
                        <option ${w.operator === '=' ? 'selected' : ''}>=</option>
                        <option ${w.operator === '>' ? 'selected' : ''}>></option>
                        <option ${w.operator === '<' ? 'selected' : ''}><</option>
                        <option ${w.operator === '>=' ? 'selected' : ''}>>=</option>
                        <option ${w.operator === '<=' ? 'selected' : ''}><=</option>
                        <option ${w.operator === '<>' ? 'selected' : ''}><></option>
                        <option ${w.operator === 'LIKE' ? 'selected' : ''}>LIKE</option>
                        <option ${w.operator === 'ILIKE' ? 'selected' : ''}>ILIKE</option>
                    </select>
                    <select data-where-idx="${idx}" data-field="valueType" style="min-width: 120px;">
                        <option value="constant" ${valueType === 'constant' ? 'selected' : ''}>📝 Константа</option>
                        <option value="column" ${valueType === 'column' ? 'selected' : ''}>🔗 Столбец таблицы</option>
                    </select>`;
        
        if (valueType === 'constant') {
            html += `<input type="text" placeholder="значение" data-where-idx="${idx}" data-field="value" value="${escapeHtml(w.value || '')}" style="min-width: 180px;">`;
        } else {
            html += `<select data-where-idx="${idx}" data-field="valueColumn" style="min-width: 180px;">
                        ${allCols.map(c => `<option value="${c}" ${c === w.valueColumn ? 'selected' : ''}>${c}</option>`).join('')}
                    </select>`;
        }
        
        html += `<button class="danger small-icon" data-remove-where="${idx}">✖</button>
                </div>`;
    });
    whereList.innerHTML = html;
    
    // Привязываем события
    document.querySelectorAll('[data-where-idx]').forEach(el => {
        const idx = parseInt(el.dataset.whereIdx);
        if (el.dataset.field === 'column') {
            el.addEventListener('change', (e) => { 
                whereConditions[idx].columnFull = e.target.value; 
                renderWhereConditions();
            });
        } else if (el.dataset.field === 'operator') {
            el.addEventListener('change', (e) => { 
                whereConditions[idx].operator = e.target.value; 
            });
        } else if (el.dataset.field === 'valueType') {
            el.addEventListener('change', (e) => { 
                whereConditions[idx].valueType = e.target.value;
                if (e.target.value === 'constant') {
                    whereConditions[idx].value = whereConditions[idx].value || '';
                    delete whereConditions[idx].valueColumn;
                } else {
                    whereConditions[idx].valueColumn = whereConditions[idx].valueColumn || getAllColumnsFlat()[0];
                    delete whereConditions[idx].value;
                }
                renderWhereConditions();
            });
        } else if (el.dataset.field === 'value') {
            el.addEventListener('input', (e) => { 
                whereConditions[idx].value = e.target.value; 
            });
        } else if (el.dataset.field === 'valueColumn') {
            el.addEventListener('change', (e) => { 
                whereConditions[idx].valueColumn = e.target.value; 
            });
        }
    });
    
    document.querySelectorAll('[data-remove-where]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(btn.dataset.removeWhere);
            whereConditions.splice(idx, 1);
            renderWhereConditions();
        });
    });
}

// 6. GROUP BY и агрегаты
function renderGroupByAndAggregates() {
    if (selectedTables.size === 0) {
        groupByCheckboxesArea.innerHTML = '— нет таблиц —';
        aggregateSelectArea.innerHTML = '';
        return;
    }
    const allColumnsFlat = getAllColumnsFlat();
    let groupHtml = '<div class="checkbox-grid">';
    allColumnsFlat.forEach(col => {
        const checked = groupByColumns.includes(col);
        groupHtml += `<label><input type="checkbox" class="groupby-cb" value="${col}" ${checked ? 'checked' : ''}> ${col}</label>`;
    });
    groupHtml += '</div>';
    groupByCheckboxesArea.innerHTML = groupHtml;
    
    document.querySelectorAll('.groupby-cb').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const val = cb.value;
            if (cb.checked) {
                if (!groupByColumns.includes(val)) groupByColumns.push(val);
            } else {
                groupByColumns = groupByColumns.filter(c => c !== val);
            }
            renderGroupByAndAggregates();
            sqlOutput.value = '';
        });
    });
    
    // Агрегаты для не-группирующих столбцов
    const selectedColsList = Object.keys(selectedColumns).length ? Object.keys(selectedColumns) : allColumnsFlat;
    const groupSet = new Set(groupByColumns);
    const nonGroupCols = selectedColsList.filter(col => !groupSet.has(col));
    
    if (enableGroupBy && groupByColumns.length > 0 && nonGroupCols.length) {
        let aggHtml = '<div><strong>📊 Агрегатные функции:</strong><br><small style="color:#4a6f8a;">для столбцов не в GROUP BY</small></div>';
        nonGroupCols.forEach(col => {
            const currentAgg = aggregations[col] || 'COUNT';
            aggHtml += `<div class="join-item" style="justify-content: space-between;">
                            <span style="font-weight:500;">${col}</span>
                            <select data-agg-col="${col}">
                                <option ${currentAgg === 'COUNT' ? 'selected' : ''}>COUNT</option>
                                <option ${currentAgg === 'SUM' ? 'selected' : ''}>SUM</option>
                                <option ${currentAgg === 'AVG' ? 'selected' : ''}>AVG</option>
                                <option ${currentAgg === 'MAX' ? 'selected' : ''}>MAX</option>
                                <option ${currentAgg === 'MIN' ? 'selected' : ''}>MIN</option>
                                <option ${currentAgg === 'STRING_AGG' ? 'selected' : ''}>STRING_AGG</option>
                            </select>
                        </div>`;
        });
        aggregateSelectArea.innerHTML = aggHtml;
        document.querySelectorAll('[data-agg-col]').forEach(sel => {
            sel.addEventListener('change', (e) => {
                aggregations[sel.dataset.aggCol] = sel.value;
            });
        });
    } else {
        aggregateSelectArea.innerHTML = enableGroupBy && groupByColumns.length === 0 ? 
            '<i>⚙️ Группировка включена, но столбцы не выбраны → обычный SELECT</i>' : 
            '<i>⚙️ Группировка выключена или нет негруппируемых столбцов</i>';
    }
}

// 7. ORDER BY
function renderOrderBy() {
    if (selectedTables.size === 0) {
        orderByList.innerHTML = '— нет таблиц —';
        return;
    }
    const allCols = getAllColumnsFlat();
    if (orderBy.length === 0) {
        orderByList.innerHTML = '<i>Нет полей сортировки</i>';
        return;
    }
    let html = '';
    orderBy.forEach((ob, idx) => {
        html += `<div class="order-item">
                    <select data-order-idx="${idx}" data-field="column" style="min-width: 200px;">
                        ${allCols.map(c => `<option value="${c}" ${ob.columnFull === c ? 'selected' : ''}>${c}</option>`).join('')}
                    </select>
                    <select data-order-idx="${idx}" data-field="direction">
                        <option ${ob.direction === 'ASC' ? 'selected' : ''}>ASC (по возрастанию)</option>
                        <option ${ob.direction === 'DESC' ? 'selected' : ''}>DESC (по убыванию)</option>
                    </select>
                    <button class="danger small-icon" data-remove-order="${idx}">✖</button>
                </div>`;
    });
    orderByList.innerHTML = html;
    
    document.querySelectorAll('[data-order-idx]').forEach(el => {
        const idx = parseInt(el.dataset.orderIdx);
        if (el.dataset.field === 'column') {
            el.addEventListener('change', (e) => { orderBy[idx].columnFull = e.target.value; renderOrderBy(); });
        } else if (el.dataset.field === 'direction') {
            el.addEventListener('change', (e) => { orderBy[idx].direction = e.target.value; });
        }
    });
    document.querySelectorAll('[data-remove-order]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(btn.dataset.removeOrder);
            orderBy.splice(idx, 1);
            renderOrderBy();
        });
    });
}

// 8. Генерация SQL (с поддержкой сравнения столбцов в WHERE)
function generateSQL() {
    if (selectedTables.size === 0) {
        return "-- Ошибка: не выбрано ни одной таблицы --";
    }
    
    // SELECT clause
    let selectCols = Object.keys(selectedColumns).length ? Object.keys(selectedColumns) : getAllColumnsFlat();
    const groupSet = new Set(enableGroupBy ? groupByColumns : []);
    let selectItems = [];
    
    for (let col of selectCols) {
        if (groupSet.has(col) || !enableGroupBy || groupByColumns.length === 0) {
            selectItems.push(col);
        } else {
            let aggFunc = aggregations[col] || 'COUNT';
            if (aggFunc === 'STRING_AGG') {
                selectItems.push(`${aggFunc}(${col}::text, ', ' ORDER BY ${col}) AS ${col.replace('.', '_')}_agg`);
            } else {
                selectItems.push(`${aggFunc}(${col}) AS ${col.replace('.', '_')}_${aggFunc.toLowerCase()}`);
            }
        }
    }
    if (selectItems.length === 0) selectItems = ['*'];
    
    // FROM + JOIN
    const fromTable = Array.from(selectedTables)[0];
    let joinClause = '';
    if (joins.length) {
        joinClause = joins.map(j => `${j.joinType} JOIN ${j.rightTable} ON ${j.leftTable}.${j.leftColumn} = ${j.rightTable}.${j.rightColumn}`).join(' ');
    } else if (selectedTables.size > 1) {
        joinClause = `-- ВНИМАНИЕ: выбрано несколько таблиц без JOIN. Используется CROSS JOIN\n${Array.from(selectedTables).slice(1).map(t => `CROSS JOIN ${t}`).join(' ')}`;
    }
    
    // WHERE (поддержка сравнения с константой или другим столбцом)
    let whereClause = '';
    if (whereConditions.length) {
        whereClause = 'WHERE ' + whereConditions.map(w => {
            const valueType = w.valueType || 'constant';
            let rightValue;
            if (valueType === 'column') {
                rightValue = w.valueColumn;
            } else {
                // Константа: число или строка в кавычках
                const rawValue = w.value || '';
                if (rawValue.toUpperCase() === 'NULL') {
                    rightValue = 'NULL';
                } else if (rawValue.toUpperCase() === 'TRUE' || rawValue.toUpperCase() === 'FALSE') {
                    rightValue = rawValue.toUpperCase();
                } else {
                    rightValue = /^\d+(\.\d+)?$/.test(rawValue) ? rawValue : `'${rawValue.replace(/'/g, "''")}'`;
                }
            }
            return `${w.columnFull} ${w.operator} ${rightValue}`;
        }).join(' AND ');
    }
    
    // GROUP BY
    let groupByClause = (enableGroupBy && groupByColumns.length) ? 'GROUP BY ' + groupByColumns.join(', ') : '';
    
    // ORDER BY
    let orderClause = orderBy.length ? 'ORDER BY ' + orderBy.map(o => `${o.columnFull} ${o.direction}`).join(', ') : '';
    
    let sql = `SELECT ${selectItems.join(', ')}\nFROM ${fromTable}`;
    if (joinClause) sql += `\n${joinClause}`;
    if (whereClause) sql += `\n${whereClause}`;
    if (groupByClause) sql += `\n${groupByClause}`;
    if (orderClause) sql += `\n${orderClause}`;
    
    return sql + ';';
}

// ======================== ОБРАБОТЧИКИ СОБЫТИЙ ========================
schemaUpload.addEventListener('change', (e) => {
    if (e.target.files.length) loadSchema(e.target.files[0]);
});

resetEverythingBtn.addEventListener('click', () => {
    resetAllState();
    showMessage('Все настройки сброшены, схема сохранена');
});

addJoinBtn.addEventListener('click', () => {
    if (selectedTables.size >= 2) {
        const arr = Array.from(selectedTables);
        joins.push({
            leftTable: arr[0],
            leftColumn: schema[arr[0]][0],
            rightTable: arr[1],
            rightColumn: schema[arr[1]][0],
            joinType: 'INNER'
        });
        renderJoinsUI();
        showMessage(`➕ Добавлен JOIN: ${arr[0]} → ${arr[1]} (INNER)`, false);
    } else {
        showMessage('Выберите минимум 2 таблицы для JOIN', true);
    }
});

globalSelectAllBtn.addEventListener('click', () => {
    getAllColumnsFlat().forEach(c => { selectedColumns[c] = true; });
    renderSelectColumns();
    renderGroupByAndAggregates();
    showMessage('✅ Выбраны все столбцы');
});

addWhereBtn.addEventListener('click', () => {
    if (selectedTables.size) {
        const all = getAllColumnsFlat();
        if (all.length) {
            whereConditions.push({ 
                columnFull: all[0], 
                operator: '=', 
                valueType: 'constant',
                value: '' 
            });
            renderWhereConditions();
        }
    } else {
        showMessage('Сначала выберите таблицы', true);
    }
});

clearGroupByBtn.addEventListener('click', () => {
    groupByColumns = [];
    enableGroupBy = false;
    enableGroupByToggle.checked = false;
    renderGroupByAndAggregates();
    sqlOutput.value = '';
    showMessage('Группировка сброшена');
});

enableGroupByToggle.addEventListener('change', (e) => {
    enableGroupBy = e.target.checked;
    if (!enableGroupBy) groupByColumns = [];
    renderGroupByAndAggregates();
    sqlOutput.value = '';
});

addOrderBtn.addEventListener('click', () => {
    if (selectedTables.size) {
        const all = getAllColumnsFlat();
        if (all.length) {
            orderBy.push({ columnFull: all[0], direction: 'ASC' });
            renderOrderBy();
        }
    } else {
        showMessage('Выберите таблицы', true);
    }
});

generateSqlBtn.addEventListener('click', () => {
    if (selectedTables.size === 0) {
        sqlOutput.value = '-- Ошибка: не выбрано ни одной таблицы --';
        showMessage('Не выбрано ни одной таблицы для генерации запроса', true);
    } else {
        const sql = generateSQL();
        sqlOutput.value = sql;
        showMessage('✅ SQL-запрос сгенерирован');
    }
});

saveSqlBtn.addEventListener('click', () => {
    const content = sqlOutput.value;
    if (!content || content.trim() === '' || content.startsWith('-- Ошибка')) {
        showMessage('Нет валидного SQL для сохранения', true);
        return;
    }
    const blob = new Blob([content], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `query_${new Date().toISOString().slice(0,19).replace(/:/g, '-')}.sql`;
    a.click();
    URL.revokeObjectURL(a.href);
    showMessage('💾 Файл сохранён');
});

// ======================== ОБРАБОТЧИК ДЛЯ ПОДСКАЗОК JOIN (сворачиваемый блок) ========================
const toggleJoinHintBtn = document.getElementById('toggleJoinHintBtn');
const joinHintContent = document.getElementById('joinHintContent');

if (toggleJoinHintBtn && joinHintContent) {
    toggleJoinHintBtn.addEventListener('click', () => {
        const isCollapsed = joinHintContent.classList.contains('collapsed');
        if (isCollapsed) {
            joinHintContent.classList.remove('collapsed');
            toggleJoinHintBtn.innerHTML = '▼ Скрыть подсказки';
        } else {
            joinHintContent.classList.add('collapsed');
            toggleJoinHintBtn.innerHTML = '▶ Показать подсказки';
        }
    });
}

// Инициализация
console.log('SQL Builder приложение загружено');