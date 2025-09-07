// src/index.js - Your Worker code
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // GET request - health check
    if (request.method === 'GET') {
      try {
        const { results } = await env.DB.prepare(
          'SELECT COUNT(*) as count FROM contacts'
        ).all();
        
        return Response.json({
          status: 'healthy',
          worker: 'talktech-contact-webhook',
          database: 'connected',
          totalContacts: results[0]?.count || 0,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        return Response.json({
          status: 'healthy',
          worker: 'talktech-contact-webhook',
          database: 'not initialized',
          message: 'Run database migrations first'
        });
      }
    }
    
    // Only accept POST for contact submissions
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Verify authentication
    const authHeader = request.headers.get('X-Signature');
    const expectedSecret = env.WEBHOOK_SECRET;
    
    if (!expectedSecret) {
      console.error('WEBHOOK_SECRET not configured');
      return Response.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }
    
    if (authHeader !== expectedSecret) {
      return Response.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    try {
      const data = await request.json();
      
      // Validate required fields
      if (!data.name || !data.email || !data.message) {
        return Response.json(
          { error: 'Missing required fields' },
          { status: 400 }
        );
      }
      
      // Create table if it doesn't exist
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS contacts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT NOT NULL,
          message TEXT NOT NULL,
          ip TEXT,
          country TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run();

      // Insert the contact
      const result = await env.DB.prepare(`
        INSERT INTO contacts (name, email, message, ip, country)
        VALUES (?, ?, ?, ?, ?)
      `).bind(
        data.name,
        data.email,
        data.message,
        data.ip || 'unknown',
        data.country || 'unknown'
      ).run();

      console.log('Contact saved:', {
        id: result.meta.last_row_id,
        email: data.email
      });

      return Response.json({
        success: true,
        message: 'Contact saved successfully',
        id: result.meta.last_row_id
      });

    } catch (error) {
      console.error('Database error:', error);
      return Response.json(
        { 
          error: 'Failed to save contact',
          details: error.message 
        },
        { status: 500 }
      );
    }
  }
};