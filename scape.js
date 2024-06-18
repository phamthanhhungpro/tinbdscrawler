const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

// Read configuration from config.json
const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));

const baseUrl = 'https://nguonchinhchu.com/bds.html?pi=';
const detailBaseUrl = 'https://nguonchinhchu.com/bds/get.html?id=';

// Define your cookie here
const cookie = 'ci_session=4900ab88bb49d033d3ed782f3a1e8909c97d3a34; _gid=GA1.2.192423850.1718590848; usr_dxcore=IxMnH1EeAIMAIyMKIxMXGyyKqSMAEyW1LKcPGyMHIyIHn1WUIQSTIH1RoSIvExc1JxMIrSMJpQMHnmSbLxMJASMSMUqJnmSPHSDkIJWTFaInEyI4IyMjAyEeZJuvEyL0IxIxq1MeZHWDIQN9Ixq4H2WgHyMAIyMuMJf1GyyKrSMyEyWVL0MnGySHZQx%3D; usr_refresh=1; _ga=GA1.2.2003700648.1718590847; _ga_GW738RQQ3N=GS1.1.1718590846.1.1.1718590971.0.0.0';

const csvWriter = createCsvWriter({
    path: 'scraped_data.csv',
    header: [
        {id: 'id', title: 'ID'},
        {id: 'title', title: 'Title'},
        {id: 'price', title: 'Price'},
        {id: 'phone', title: 'Phone'},
        {id: 'district', title: 'District'},
        {id: 'datePosted', title: 'Date Posted'},
        {id: 'structure', title: 'Structure'},
        {id: 'street', title: 'Street'},
        {id: 'land', title: 'Land'},
        {id: 'area', title: 'Area'},
        {id: 'certificate', title: 'Certificate'},
        {id: 'contact', title: 'Contact'},
        {id: 'address', title: 'Address'}
    ]
});

async function fetchHtml(url) {
    try {
        const { data } = await axios.get(url, {
            headers: {
                'Cookie': cookie
            }
        });
        return data;
    } catch (error) {
        console.error(`Error fetching the URL ${url}:`, error);
        return null;
    }
}

async function scrapeItemDetails(id) {
    const itemUrl = `${detailBaseUrl}${id}&m=0`;
    const html = await fetchHtml(itemUrl);
    if (!html) return null;

    const $ = cheerio.load(html);
    const details = {};

    // Parsing the list items within the Nội dung section
    $('label:contains("Nội dung:")').next('p').next('ol').find('li').each((index, element) => {
        const text = $(element).text().trim();
        if (text.includes('Kết cấu')) {
            details.structure = text.replace('Kết cấu', '').trim();
        } else if (text.includes('Ngõ nông')) {
            details.street = text.replace('Ngõ nông', '').trim();
        } else if (text.includes('Đất ở')) {
            details.land = text.replace('Đất ở', '').trim();
        } else if (text.includes('DT')) {
            details.area = text.replace('DT', '').trim();
        } else if (text.includes('Sổ đỏ')) {
            details.certificate = 'Sổ đỏ';
        } else if (text.includes('Giá')) {
            details.price = text.replace('Giá', '').trim();
        } else if (text.includes('Liên hệ')) {
            details.contact = text.replace('Liên hệ', '').trim();
        } else if (text.includes('Địa chỉ')) {
            details.address = text.replace('Địa chỉ', '').trim();
        }
    });
    
    return details;
}

async function scrapeData(pageIndex) {
    const pageUrl = `${baseUrl}${pageIndex}`;
    const html = await fetchHtml(pageUrl);
    if (!html) return;

    const $ = cheerio.load(html);
    
    // Select the elements you want to scrape
    const items = [];
    const detailPromises = [];
    const rows = $('.dnnFormItem .listNews .dnnGrid tbody tr');

    for (let i = 0; i < rows.length; i++) {
        const element = rows[i];
        const titleElement = $(element).find('.columTitle a');
        const title = titleElement.text().trim();
        const onclick = titleElement.attr('onclick');
        const idMatch = onclick.match(/'(\d+)'/);
        const id = idMatch ? idMatch[1] : null;

        const price = $(element).find('.columPrice span').text().trim();
        const phone = $(element).find('.columPhone .lblphone').text().trim();
        const district = $(element).find('.Description span[data-filter-district]').text().trim();
        const datePosted = $(element).find('.Description span').last().text().trim();

        if (title && price && phone && id) {
            items.push({ id, title, price, phone, district, datePosted });
            detailPromises.push(scrapeItemDetails(id));
        }
    }

    const detailsArray = await Promise.all(detailPromises);

    // Merging details with the items
    items.forEach((item, index) => {
        item.details = detailsArray[index];
    });

// Normalize the text before writing it to the CSV file
const records = items.map(item => ({
    id: item.id,
    title: item.title.normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
    price: item.price.normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
    phone: item.phone.normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
    district: item.district.normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
    datePosted: item.datePosted,
    structure: item.details.structure?.normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
    street: item.details.street?.normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
    land: item.details.land?.normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
    area: item.details.area?.normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
    certificate: item.details.certificate?.normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
    contact: item.details.contact?.normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
    address: item.details.address?.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}));

    await csvWriter.writeRecords(records);

    console.log(`Data from page ${pageIndex} has been saved to the CSV file.`);
}

async function main() {
    for (let i = config.current; i <= config.endPi; i++) {
        await scrapeData(i);
        config.current = i + 1; // Update the current page index
        fs.writeFileSync('config.json', JSON.stringify(config, null, 2), 'utf8');
    }

    console.log('Scraping completed.');
}

main();
