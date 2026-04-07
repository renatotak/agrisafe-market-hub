import { env } from 'process'
import { createAdminClient } from '@/utils/supabase/admin'
import { generateEmbedding, summarizeText, isGeminiConfigured } from '@/lib/gemini'

export async function POST(req: Request) {
  try {
    if (!isGeminiConfigured()) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'Gemini API not configured' 
      }), { status: 400 })
    }

    const { prompt, history = [], lang = 'pt' } = await req.json()
    if (!prompt) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'Prompt is required' 
      }), { status: 400 })
    }

    const supabase = createAdminClient()

    // 1. Get embedding for the prompt
    const queryEmbedding = await generateEmbedding(prompt)

    // 2. Search knowledge base (Tier 1-4)
    const { data: contextItems, error: searchError } = await supabase.rpc('match_knowledge_items', {
      query_embedding: queryEmbedding,
      match_threshold: 0.3,
      match_count: 5
    })

    if (searchError) throw searchError

    // 3. Construct context string
    const context = (contextItems || [])
      .map((it: any) => `[TIER ${it.tier}] ${it.title}: ${it.content || it.summary}`)
      .join('\n\n')

    // 4. Generate answer using Gemini
    const systemPrompt = `Você é o "AgriSafe Oracle", um assistente de inteligência de mercado sênior especializado no agronegócio brasileiro.
Sua missão é fornecer respostas precisas, consultivas e baseadas em evidências usando o contexto fornecido.

DIRETRIZES:
- Se a informação estiver no contexto, use-a e cite a fonte (ex: "Segundo dados da CONAB...").
- Se a informação NÃO estiver no contexto, use seu conhecimento geral mas sinalize claramente o que é análise externa.
- Mantenha o tom profissional, formal e objetivo da AgriSafe.
- Idioma da resposta: ${lang === 'pt' ? 'Português Brasileiro' : 'English'}.
- Formate a resposta usando Markdown (bold, lists, etc).

CONTEXTO DA BASE DE CONHECIMENTO:
${context || 'Nenhuma informação específica encontrada na base de conhecimento para esta consulta.'}

HISTÓRICO DA CONVERSA:
${history.map((h: any) => `${h.role === 'user' ? 'Usuário' : 'Oráculo'}: ${h.content}`).join('\n')}
`

    const answer = await summarizeText(systemPrompt, prompt, 1500)

    return new Response(JSON.stringify({
      success: true,
      answer,
      context: (contextItems || []).map((it: any) => ({
        id: it.id,
        title: it.title,
        tier: it.tier,
        source_url: it.source_url
      }))
    }), {
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error: any) {
    console.error('Chat API Error:', error)
    return new Response(JSON.stringify({ 
      success: false, 
      message: error.message 
    }), { status: 500 })
  }
}
