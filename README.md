# tsiviskveli

ქართულენოვანი responsive ვებ-აპი ყველის მარაგების აღრიცხვისთვის.

## GitHub Pages (root)

აპის Pages ვერსია მუშაობს რეპოს root ფაილებით:
- `index.html`
- `app.js`
- `styles.css`

URL:
- `https://imed458.github.io/tsiviskveli/`

## Firebase/Firestore ინტეგრაცია

აპი უკვე დაკავშირებულია Firestore-სთან (`app.js`-ში მოცემული კონფიგით) და რეალურ დროში მუშაობს.

### გამოყენებული კოლექციები

- `products`
- `employees`
- `employeeCodes`
- `logs`
- `operations`
- `meta/bootstrap`

### ლოგიკა

- საწყისი seed ერთჯერადად კეთდება (`meta/bootstrap` ტრანზაქციით)
- ოპერაცია (`შეტანა/გატანა`) სრულდება ატომურად Firestore transaction-ით:
  - ამოწმებს თანამშრომლის კოდს (`employeeCodes`)
  - ამოწმებს მარაგს
  - ანახლებს მარაგს
  - წერს ლოგს
  - წერს `operations/{operationId}` დუბლირების პრევენციისთვის

## ფუნქციონალი

- ორი საცავი: `ბოქსი`, `ორ სივრციანი`
- პროდუქტების მართვა (ადმინი): დამატება/რედაქტირება/წაშლა
- თანამშრომლების მართვა (ადმინი): დამატება/რედაქტირება/წაშლა
- თანამშრომლის უნიკალური კოდი (რიცხვი ან ალფანუმერული)
- კოდით დადასტურება ოპერაციისას
- ლოგი ზუსტი დროით (წამით), ახალი → ძველი
- ლოგის ფილტრები: პროდუქტი, თანამშრომელი, ოპერაცია, საცავი, თარიღის დიაპაზონი
- სწრაფი ძებნა პროდუქტის სახელით
- `კგ` ერთეული ყველგან, decimal მხარდაჭერით

## რეკომენდებული Firestore Rules (ტესტ/დემო)

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

შენიშვნა: production-ში ჩაანაცვლე ავთენტიფიკაციაზე დაფუძნებული წესებით.

## ალტერნატიული ვარიანტები

რეპოში დამატებით შენახულია:
- `frontend-localstorage/` - LocalStorage დემო
- `backend-node-sqlite/` - Node.js + SQLite API
