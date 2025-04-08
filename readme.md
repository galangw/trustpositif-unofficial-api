# TrustPositif Unofficial API

> **BIG THANKS to [https://github.com/alsyundawy/TrustPositif](https://github.com/alsyundawy/TrustPositif) for providing the comprehensive blacklist database that powers this service!**

Free API service to check if domains are blacklisted by TrustPositif Kominfo.

Base URL: `https://trustpositif.glng.my.id`

## API Endpoints

| Endpoint         | Method | Description                      |
| ---------------- | ------ | -------------------------------- |
| `/check/:domain` | GET    | Check if a domain is blacklisted |

## How to Use

### Domain Check

```
GET /check/{domain}
```

**Example Request:**

```bash
curl https://trustpositif.glng.my.id/check/example.com
```

**Example Response:**

```json
{
  "domain": "example.com",
  "blocked": false,
  "timestamp": "2023-11-15T12:34:56.789Z"
}
```

## Limitations

- **Rate Limit**: 60 requests per minute per IP address
- **Single Domain**: One domain per request only

## Notes

- The blacklist database is sourced from [TrustPositif repository](https://github.com/alsyundawy/TrustPositif)
- The API uses Bloom Filter for efficient domain lookups
- This service is maintained as a public utility

## Troubleshooting

- **429 Error**: You've hit the rate limit, wait 1 minute
- **Domain format**: Make sure you're using correct domain format (e.g., example.com)

## Credits

- Web UI generated with Claude 3.7 Sonnet
- Maintained and modified by [galangw](https://github.com/galangw)
