import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Definisikan header CORS untuk mengizinkan permintaan dari ekstensi Anda
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Tangani preflight request untuk CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Buat koneksi ke Supabase
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )

    // Ambil IP pengguna dari header permintaan
    const userIp = req.headers.get('x-forwarded-for')?.split(',').shift()

    if (!userIp) {
      throw new Error('Alamat IP tidak ditemukan.')
    }
    
    // Cek apakah IP pengguna ada di dalam tabel whitelist
    const { data, error } = await supabaseClient
      .from('ip_whitelist')
      .select('ip_address')
      .eq('ip_address', userIp)

    if (error) throw error

    // Jika 'data' tidak kosong (panjangnya > 0), berarti IP ditemukan dan diizinkan
    const isAllowed = data && data.length > 0

    // Kirim kembali respons dalam format JSON
    return new Response(
      JSON.stringify({ isAllowed: isAllowed, ip: userIp }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
    )
  }
})