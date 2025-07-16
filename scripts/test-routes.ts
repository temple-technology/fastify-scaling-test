import axios from 'axios';

const BASE_URL = 'http://localhost:3000';

type Route = {
  method: 'get' | 'post' | 'put';
  path: string;
  data?: any;
};

const routes: Route[] = [
  // Health & root
  { method: 'get', path: '/' },
  { method: 'get', path: '/health' },

  // Simple GETs
  { method: 'get', path: '/api/simple/categories' },
  { method: 'get', path: '/api/simple/products' },
  { method: 'get', path: '/api/simple/product/1' },
  { method: 'get', path: '/api/simple/user/1' },

  // Medium GETs
  { method: 'get', path: '/api/medium/products-with-category' },
  { method: 'get', path: '/api/medium/users-by-city/Test City' },
  { method: 'get', path: '/api/medium/product-search?q=laptop' },
  { method: 'get', path: '/api/medium/user-orders/1' },

  // Complex GETs
  { method: 'get', path: '/api/complex/user-profile/1' },
  { method: 'get', path: '/api/complex/product-analytics/1' },
  { method: 'get', path: '/api/complex/dashboard-stats' },
  { method: 'get', path: '/api/complex/top-performers' },

  // Stress GETs
  { method: 'get', path: '/api/stress/user-journey/1' },
  { method: 'get', path: '/api/stress/product-page/1' },
  { method: 'get', path: '/api/mixed/random-operation' },

  // POSTs (minimal valid data)
  { method: 'post', path: '/api/simple/log-activity', data: { userId: 1, activityType: 'page_view' } },
  { method: 'post', path: '/api/simple/search-log', data: { query: 'test', userId: 1 } },
  { method: 'post', path: '/api/medium/add-review', data: { userId: 1, productId: 1, rating: 5, title: 'Test', content: 'Test review' } },
  { method: 'put', path: '/api/medium/update-user-profile', data: { userId: 1, profileUpdates: { city: 'Test City' } } },
  { method: 'post', path: '/api/complex/create-order', data: { userId: 1, items: [{ productId: 1, quantity: 1 }], shippingAddress: { street: '123', city: 'Test', state: 'TS', zipCode: '12345', country: 'US' } } },
  { method: 'post', path: '/api/stress/checkout-simulation', data: { userId: 1, items: [{ productId: 1, quantity: 1 }], shippingAddress: { street: '123', city: 'Test', state: 'TS', zipCode: '12345', country: 'US' }, paymentMethod: 'credit_card' } },
];

async function testRoute(route: Route) {
  const url = BASE_URL + route.path;
  try {
    let res;
    if (route.method === 'get') {
      res = await axios.get(url);
    } else if (route.method === 'post') {
      res = await axios.post(url, route.data);
    } else if (route.method === 'put') {
      res = await axios.put(url, route.data);
    }
    console.log(`✅ [${route.method.toUpperCase()}] ${route.path} - Status: ${res.status}`);
    if (typeof res.data === 'object') {
      console.log('   Response keys:', Object.keys(res.data));
    } else {
      console.log('   Response:', res.data);
    }
  } catch (err: any) {
    if (err.response) {
      console.log(`❌ [${route.method.toUpperCase()}] ${route.path} - Status: ${err.response.status}`);
      console.log('   Error response:', err.response.data);
    } else {
      console.log(`❌ [${route.method.toUpperCase()}] ${route.path} - Error:`, err.message);
    }
  }
}

(async () => {
  for (const route of routes) {
    await testRoute(route);
  }
})(); 