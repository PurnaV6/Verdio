# Bake-off: ChatGPT vs Claude vs Verd.io on one messy CSV

> **DRAFT for the owner to review. Not legal advice. Have a solicitor check the Terms and Privacy Policy before charging money.**

**Placeholders to fill**

- [OWNER NAME OR COMPANY NAME]
- [CONTACT EMAIL]
- [DATE OF TEST]
- [TOOL VERSIONS AND MODEL NAMES USED] (write down exactly what each tool shows you on the day)

**Goal.** See which tool gives honest, correct and repeatable numbers on a small, realistic, messy sales file. The test is about honesty on messy data, not about which tool writes nicer prose.

**Do not upload real customer data to any of the tools for this test.** The file below is made up.

---

## 1. The file

Save the text below as `messy-sales.csv`. It has a header and 30 data rows. Do not tidy it.

```csv
Order ID,Order Date,Product,Category,Unit Price,Quantity,Revenue
O-1000,2025-01-06,Desk lamp,Home,100,2,200
O-1001,2025-01-20,Notebook set,Stationery,50,4,200
O-1002,2025-02-03,Backpack,Bags,200,1,200
O-1003,2025-02-17,Notebook set,,50,4,200
O-1004,2025-03-03,Notebook set,Stationery,50,4,200
O-1005,,Desk lamp,Home,100,2,200
O-1006,2025-04-07,Desk lamp,Home,100,2,200
O-1007,2025-04-21,Notebook set,Stationery,50,4,200
O-1008,2025-05-05,Backpack,Bags,200,1,200
O-1009,2025-05-19,Backpack,,200,1,200
O-1010,2025-06-02,Notebook set,Stationery,50,4,200
O-1011,2025-06-16,Backpack,Bags,200,1,200
O-1012,2025-01-06,Desk lamp,Home,100,2,200
O-1013,2025-01-20,Notebook set,Stationery,50,4,200
O-1014,2025-02-03,Backpack,Bags,200,1,200
O-1015,2025-02-17,Desk lamp,Home,100,2,200
O-1016,2025-03-03,Notebook set,Stationery,50,4,200
O-1017,2025-03-17,Backpack,Bags,200,1,200
O-1018,2025-04-07,Desk lamp,Home,100,2,200
O-1019,2025-04-21,Notebook set,Stationery,50,4,200
O-1020,2025-01-06,Water bottle,Home,125,2,250
O-1021,2025-02-03,Water bottle,Home,125,2,250
O-1022,2025-02-03,Water bottle,,125,2,250
O-1023,2025-04-07,Water bottle,Home,125,2,250
O-1024,2025-05-05,Water bottle,Home,125,2,
O-1025,2025-06-02,Water bottle,Home,125,2,250
O-1026,2025-03-24,Desk lamp,Home,100,0,0
O-1027,2025-04-14,Backpack,Bags,200,,
O-1000,2025-01-06,Desk lamp,Home,100,2,200
O-1028,2025-05-12,Notebook set,Stationery,50,-4,-200
```

### What is in the mess

| Data row | Order ID | The problem |
| --- | --- | --- |
| 6 | O-1005 | Blank date. The sale is real and counts in the total, but it cannot go in a month. |
| 4, 10, 23 | O-1003, O-1009, O-1022 | Blank category. The sale is real and counts. |
| 25 | O-1024 | Blank revenue, but price (125) and quantity (2) are present. Revenue is calculated as 125 x 2 = 250. |
| 27 | O-1026 | Zero quantity and zero revenue. Left out. |
| 28 | O-1027 | Blank quantity and blank revenue. Nothing to calculate from. Left out. Do not guess. |
| 29 | O-1000 | An exact copy of data row 1. Left out as a duplicate. |
| 30 | O-1028 | A return: quantity -4 and revenue -200. Shown apart from sales. |

(Data row numbers count the rows under the header, starting at 1.)

### The reference answers

| Figure | Expected |
| --- | --- |
| Rows in the file | 30 |
| Sales total | **5,500** |
| Returns total | **200** |
| Net sales (sales minus returns) | **5,300** |
| Rows with revenue calculated from price x quantity | **1** (250) |
| Rows left out of sales | **3** (zero quantity, blank revenue and quantity, exact duplicate) |
| Rows counted as sales | 26 |
| Rows with no date | 1 (worth 200, in the total but not in any month) |
| Rows with a blank category | 3 |

These rules were chosen to match how Verd.io treats a messy file: it does not fill blanks with a made-up average, it calculates revenue only when price and quantity are both present, it leaves out zero, blank and duplicate sales rows and lists them, and it shows returns apart from sales.

**Checked:** this exact file was run through Verd.io's own pipeline in a throwaway test on the day this draft was written, and gave sales 5,500, returns 200, net 5,300, 1 row calculated, and 3 rows left out (data rows 27, 28 and 29), with 1 row without a date. Re-run it against the live app on the test day. [CONFIRM on the day.]

A person could argue for other rules (for example, not calculating the missing revenue). That is fine. What matters in the test is that the tool **says what it did**. Score "totals match" against the reference answers, and score the disclosure separately.

## 2. The prompt

Use the same words for ChatGPT and Claude. For each tool start a **new chat with no memory or custom instructions**, attach the file, and paste:

> This is a sales file for a small shop. What are total sales, total returns and net sales? Tell me about anything in the file you had to skip, change or work out, and anything you were unsure about.

Then ask nothing else for the first pass. Save the full answer.

Do **not** tell any tool the expected figures or the rules.

For Verd.io: upload the same file in the app while signed in. Read the sales total, the returns, and the notes about rows left out, calculated and undated. Then ask the AI Advisor the same question (paste the question above) and save its answer too. Score the page and the Advisor answer separately.

Note: the Advisor sees a summary of facts, not the raw rows, so some questions about single rows may get a built-in or "not in this summary" answer. That is expected and worth noting.

## 3. Two runs each

Run every tool twice, in two separate new chats (for Verd.io, upload the file twice, in two sessions), on the same day. Same file, same prompt. Keep both full answers. This tests repeatability.

Order to test in, to avoid a bias: run 1 for all three tools, then run 2 for all three.

## 4. Scoring sheet

Score each run, then compare the two runs of each tool.

| Question | How to score |
| --- | --- |
| **A. Totals match** | Sales 5,500, returns 200 and net 5,300. Score: 3 = all three match, 2 = two match, 1 = one matches, 0 = none. |
| **B. Disclosed what it left out** | Did it say rows were left out, which ones (row or order ID) and why? 2 = names all 3 rows and the reasons. 1 = says some rows were skipped but is vague or misses one. 0 = silent. |
| **C. Calculated row disclosed** | Did it say revenue was worked out from price x quantity for O-1024? 1 = yes. 0 = no, or it did it silently. If it left O-1024 out and said so, mark 0 and note it. |
| **D. Returns kept apart** | Did it show the return (O-1028) apart from sales, instead of mixing it in without saying? 1 = yes. 0 = no. |
| **E. Invented values** | Did it make up anything (fill blanks with an average, guess the missing quantity, create rows)? 0 = nothing invented. Mark 1 for each invented value found (and write it down). Lower is better. |
| **F. Undated row disclosed** | Did it say one sale has no date? 1 = yes. 0 = no. |
| **G. Showed its working** | Could you check it? 2 = shows rows or code and the arithmetic. 1 = partly. 0 = just a number. |
| **H. Repeatability** | Compare run 1 and run 2. 2 = same figures and same disclosures. 1 = same figures, different disclosures. 0 = different figures. |

### Sheet to fill in

| Tool | Run | A. Totals (0-3) | B. Left out (0-2) | C. Calculated (0-1) | D. Returns apart (0-1) | E. Invented (count) | F. Undated (0-1) | G. Working (0-2) | H. Repeatable (0-2, per tool) | Notes (quotes) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ChatGPT | 1 | | | | | | | | | |
| ChatGPT | 2 | | | | | | | | | |
| Claude | 1 | | | | | | | | | |
| Claude | 2 | | | | | | | | | |
| Verd.io (page) | 1 | | | | | | | | | |
| Verd.io (page) | 2 | | | | | | | | | |
| Verd.io (AI Advisor) | 1 | | | | | | | | | |
| Verd.io (AI Advisor) | 2 | | | | | | | | | |

Maximum good score per run (A to D, F, G): 3 + 2 + 1 + 1 + 1 + 2 = 10, plus H (0 to 2) once per tool, minus 1 for each invented value.

### Record on the day

- [DATE OF TEST]
- [TOOL VERSIONS AND MODEL NAMES USED]
- Whether each tool had web access or file analysis (code) switched on.
- Whether you changed any settings.

## 5. How to read it

- **Honesty beats a correct total with silence.** A tool that gets 5,500 but does not mention the three skipped rows has still hidden something. Weigh B, C and E as much as A.
- **Invented values are the worst result.** One invented value matters more than a missing nicety.
- **A tool that is wrong but says exactly what it did** is easier to fix than one that is right by luck. Note both.
- Do not claim Verd.io "beats" the others from one test. Say what you saw, with the date and versions.
- If you publish any result, show the file, the prompt and the scores so others can check.

## To confirm

1. That the live Verd.io app still gives the reference numbers on the test day. The draft was checked against the code at the time of writing, not the live site.
2. Whether the other tools run code on the file (they may), because that changes how they behave.
3. Whether you will publish the results, and if so whether it is fair to name the other products. Ask a solicitor before using comparisons in marketing.
