# talasaman-gogn

A simple static page for browsing the open data API at [talasaman.is/gogn](https://talasaman.is/gogn).
Each button calls one endpoint and shows the JSON `data` array as a table you can collapse.

## Run

No build step. Open `index.html` directly, or serve the folder:

```bash
python3 -m http.server 8000
```

## Endpoints

| Endpoint | Contents |
|---|---|
| `/api/v1/circles` | Ring hierarchy with member counts |
| `/api/v1/places` | Favourite places + reasons (coords rounded ~1 km) |
| `/api/v1/islenskast` | "Hvað er íslenskast?" answers, categorised |
| `/api/v1/topics` | Discussion words by frequency |
| `/api/v1/summaries` | Table discussion summaries (+ audio where consented) |
| `/api/v1/stats` | Aggregate metrics |

CORS is open, and the limit is 120 requests/min per IP.

## Licence

Gögn: Samtal, félag til almannaheilla (talasaman.is), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
