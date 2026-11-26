"""Create a sample e-commerce SQLite database (shop.db)."""
import random
import sqlite3
from datetime import date, timedelta
from pathlib import Path

DB_PATH = Path(__file__).parent / "shop.db"
random.seed(42)

FIRST = ["Aarav", "Ananya", "Rohan", "Priya", "Arjun", "Sneha", "Ishaan", "Diya",
         "Kabir", "Meera", "Rahul", "Riya", "Sourav", "Debjani", "Vikram", "Neha"]
LAST = ["Sharma", "Banerjee", "Patel", "Iyer", "Das", "Reddy", "Singh", "Mukherjee", "Nair", "Gupta"]
CITIES = ["Kolkata", "Mumbai", "Delhi", "Bengaluru", "Chennai", "Hyderabad", "Pune"]
CATEGORIES = {"Electronics": (1500, 40000), "Books": (150, 900), "Clothing": (400, 4000),
              "Home": (300, 8000), "Sports": (500, 6000)}

SCHEMA = """
CREATE TABLE customers (
    customer_id INTEGER PRIMARY KEY,
    name TEXT,
    city TEXT,
    signup_date TEXT
);
CREATE TABLE products (
    product_id INTEGER PRIMARY KEY,
    name TEXT,
    category TEXT,
    price REAL
);
CREATE TABLE orders (
    order_id INTEGER PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(customer_id),
    order_date TEXT,
    status TEXT
);
CREATE TABLE order_items (
    item_id INTEGER PRIMARY KEY,
    order_id INTEGER REFERENCES orders(order_id),
    product_id INTEGER REFERENCES products(product_id),
    quantity INTEGER
);
"""


def rand_date(start: date, end: date) -> date:
    return start + timedelta(days=random.randint(0, (end - start).days))


def main():
    DB_PATH.unlink(missing_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.executescript(SCHEMA)

    customers = [
        (i, f"{random.choice(FIRST)} {random.choice(LAST)}", random.choice(CITIES),
         rand_date(date(2024, 1, 1), date(2026, 6, 30)).isoformat())
        for i in range(1, 201)
    ]
    con.executemany("INSERT INTO customers VALUES (?,?,?,?)", customers)

    products, pid = [], 1
    for cat, (lo, hi) in CATEGORIES.items():
        for n in range(1, 9):
            products.append((pid, f"{cat} Item {n}", cat, round(random.uniform(lo, hi), 2)))
            pid += 1
    con.executemany("INSERT INTO products VALUES (?,?,?,?)", products)

    statuses = ["delivered"] * 80 + ["shipped"] * 8 + ["cancelled"] * 7 + ["returned"] * 5
    item_id = 1
    for order_id in range(1, 1501):
        cust = random.choice(customers)
        order_date = rand_date(date.fromisoformat(cust[3]), date(2026, 11, 20))
        con.execute("INSERT INTO orders VALUES (?,?,?,?)",
                    (order_id, cust[0], order_date.isoformat(), random.choice(statuses)))
        for prod in random.sample(products, random.randint(1, 4)):
            con.execute("INSERT INTO order_items VALUES (?,?,?,?)",
                        (item_id, order_id, prod[0], random.randint(1, 3)))
            item_id += 1

    con.commit()
    con.close()
    print(f"Created {DB_PATH}")


if __name__ == "__main__":
    main()
