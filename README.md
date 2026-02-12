# ყველის ინვენტარის ვებ-აპი (Responsive, ქართული UI)

ეს პაკეტი შეიცავს ორ დამოუკიდებელ ვარიანტს:

1. `frontend-localstorage/` - სრული Frontend დემო, მონაცემებით `LocalStorage`-ში.
2. `backend-node-sqlite/` - Backend API + SQLite (სრულფასოვანი სერვერული ვარიანტი).

## 1) Frontend დემო (LocalStorage)

### გაშვება

```bash
cd /Users/giorgiimedashvili/Documents/New\ project/cheese-inventory-app/frontend-localstorage
python3 -m http.server 8080
```

ბრაუზერში გახსენით:
`http://localhost:8080`

### რა მუშაობს

- ორი საცავი: `ბოქსი`, `ორ სივრციანი`
- პროდუქტების CRUD (ადმინი)
- თანამშრომლების CRUD + უნიკალური კოდი (ადმინი)
- ოპერაცია: `შეტანა` / `გატანა`
- კოდით დადასტურება მოდალში: `შეიყვანე თანამშრომლის კოდი`
- არასწორი კოდის ბლოკირება
- სწორი კოდით ოპერაციის შესრულება და ლოგში თანამშრომლის სრული სახელის შენახვა
- ლოგი ახალი -> ძველი, ზუსტი დროით (საათი/წუთი/წამი)
- ლოგის ფილტრები:
  - პროდუქტი
  - თანამშრომელი
  - ოპერაციის ტიპი
  - საცავი
  - თარიღის დიაპაზონი (`-დან`, `-მდე`)
- სწრაფი ძებნა პროდუქტის სახელით
- `გატანა` ვერ შესრულდება თუ მარაგი ნაკლებია
- ერთეული ყველგან: `კგ` (decimal მხარდაჭერით, მაგ: `1.25`)

## 2) Backend + SQLite ვარიანტი

### გაშვება

```bash
cd /Users/giorgiimedashvili/Documents/New\ project/cheese-inventory-app/backend-node-sqlite
npm install
npm run dev
```

API ხელმისაწვდომია:
`http://localhost:4000`

### მთავარი Endpoint-ები

- `GET /api/bootstrap` - პროდუქტები, თანამშრომლები, ლოგები
- `POST /api/products`
- `PUT /api/products/:id`
- `DELETE /api/products/:id`
- `POST /api/employees`
- `PUT /api/employees/:id`
- `DELETE /api/employees/:id`
- `POST /api/operations` - ატომური ოპერაცია (მარაგის განახლება + ლოგის ჩანაწერი ერთ ტრანზაქციაში)
- `GET /api/logs` - ფილტრირებადი ლოგი

## მონაცემთა სტრუქტურა

### Products

```json
{
  "id": "prd_xxx",
  "name": "სულგუნი",
  "stocks": {
    "box": 10.5,
    "twoSpace": 7.25
  },
  "createdAt": "ISO-თარიღი",
  "updatedAt": "ISO-თარიღი"
}
```

### Employees

```json
{
  "id": "emp_xxx",
  "firstName": "ნიკა",
  "lastName": "ღაღაშვილი",
  "code": "1",
  "createdAt": "ISO-თარიღი"
}
```

### Logs

```json
{
  "id": "log_xxx",
  "operationId": "op_xxx",
  "timestamp": "ISO-თარიღი",
  "employeeId": "emp_xxx",
  "employeeName": "ნიკა ღაღაშვილი",
  "operationType": "შეტანა",
  "productId": "prd_xxx",
  "productName": "სულგუნი",
  "storage": "ბოქსი",
  "quantityKg": 1.25,
  "comment": "სურვილისამებრ"
}
```

### Users (როლები)

ამ დემოში როლი UI რეჟიმით იცვლება:

```json
{
  "role": "user | admin"
}
```

სერვერულ/პროექტულ ვერსიაში რეკომენდებულია:

```json
{
  "id": "usr_xxx",
  "username": "admin",
  "role": "admin | user",
  "passwordHash": "..."
}
```

## ატომურობა და დუბლირების პრევენცია

- Frontend ვერსიაში თითო ოპერაციას აქვს `operationId`; უკვე დამუშავებული `operationId` მეორედ აღარ სრულდება.
- ღილაკები იბლოკება დამუშავებისას, რომ ორმაგი დაჭერა ვერ გამოიწვიოს დუბლირება.
- Backend ვერსიაში `POST /api/operations` არის SQLite ტრანზაქცია:
  - ამოწმებს თანამშრომლის კოდს
  - ამოწმებს მარაგს
  - ანახლებს მარაგს
  - წერს ლოგს
  - ყველაფერი სრულდება ერთ ატომურ ოპერაციად

## Responsive დიზაინი

- მობილურზე: დიდი ღილაკები, ქვედა ნავიგაცია, ერთი სვეტი
- iPad-ზე: grid-ები ფართოვდება 2/3 სვეტად, უკეთესი კითხვადობა
- დესკტოპზე: მაქს. სიგანე, კარტების/ფილტრების გაფართოებული განლაგება

## Firebase

ამ რეალიზაციაში Firebase არ არის გამოყენებული (არჩეულია Node.js + SQLite ვარიანტი).
თუ გინდა, შემიძლია იმავე UI-ზე მესამე ვარიანტად Firebase/Firestore ინტეგრაციაც პირდაპირ დავამატო.
